import { db } from "../db";

export type InventoryReason = "restock" | "manual_adjustment" | "ticket_use" | "pm_use" | "transfer_out" | "transfer_in";

export interface AdjustStockParams {
  itemId: number;
  locationId: number;
  delta: number;
  reason: InventoryReason;
  ticketId?: number | null;
  pmScheduleId?: number | null;
  userId?: number | null;
  notes?: string | null;
}

export interface AdjustStockResult {
  stock: { id: number; quantity_on_hand: number; reorder_threshold: number };
  crossedBelowThreshold: boolean;
}

export async function adjustStock(params: AdjustStockParams): Promise<AdjustStockResult | null> {
  return db.transaction(async (trx) => {
    const stock = await trx("inventory_stock")
      .where({ item_id: params.itemId, location_id: params.locationId })
      .forUpdate()
      .first();
    if (!stock) return null;

    const quantityBefore = stock.quantity_on_hand;
    const quantityAfter = quantityBefore + params.delta;
    const threshold = stock.reorder_threshold;

    await trx("inventory_stock").where({ id: stock.id }).update({ quantity_on_hand: quantityAfter });

    await trx("inventory_transactions").insert({
      item_id: params.itemId,
      location_id: params.locationId,
      quantity_delta: params.delta,
      quantity_after: quantityAfter,
      reason: params.reason,
      ticket_id: params.ticketId ?? null,
      pm_schedule_id: params.pmScheduleId ?? null,
      user_id: params.userId ?? null,
      notes: params.notes ?? null
    });

    // Only re-fires after a restock brings the quantity back to/above threshold and it
    // drops below again — depleting further while already-below never repeats the alert.
    const crossedBelowThreshold = threshold > 0 && quantityBefore >= threshold && quantityAfter < threshold;

    return {
      stock: { id: stock.id, quantity_on_hand: quantityAfter, reorder_threshold: threshold },
      crossedBelowThreshold
    };
  });
}

export interface TransferStockParams {
  itemId: number;
  fromLocationId: number;
  toLocationId: number;
  quantity: number;
  userId?: number | null;
  notes?: string | null;
}

export type TransferStockResult =
  | { ok: true; source: { id: number; quantity_on_hand: number; reorder_threshold: number }; destination: { id: number; quantity_on_hand: number }; crossedBelowThreshold: boolean }
  | { ok: false; error: "no_source_stock" | "insufficient_stock" };

/**
 * Moves quantity of one item from one location to another as a single atomic
 * operation, auto-creating the destination's stock row (at 0/0) if this item
 * isn't tracked there yet — same as a fresh "start tracking" would, without
 * requiring that as a separate manual step first.
 *
 * Both rows are locked in ascending location_id order (not "source then
 * destination") so a concurrent transfer running the opposite direction
 * between the same two locations locks in the same order and can't deadlock
 * against this one.
 */
export async function transferStock(params: TransferStockParams): Promise<TransferStockResult> {
  return db.transaction(async (trx) => {
    const [firstLocationId, secondLocationId] =
      params.fromLocationId < params.toLocationId
        ? [params.fromLocationId, params.toLocationId]
        : [params.toLocationId, params.fromLocationId];

    const firstRow = await trx("inventory_stock")
      .where({ item_id: params.itemId, location_id: firstLocationId })
      .forUpdate()
      .first();
    const secondRow = await trx("inventory_stock")
      .where({ item_id: params.itemId, location_id: secondLocationId })
      .forUpdate()
      .first();

    const source = params.fromLocationId === firstLocationId ? firstRow : secondRow;
    let destination = params.toLocationId === firstLocationId ? firstRow : secondRow;

    if (!source) return { ok: false, error: "no_source_stock" };
    if (source.quantity_on_hand < params.quantity) return { ok: false, error: "insufficient_stock" };

    if (!destination) {
      [destination] = await trx("inventory_stock")
        .insert({ item_id: params.itemId, location_id: params.toLocationId, quantity_on_hand: 0, reorder_threshold: 0 })
        .returning("*");
    }

    const sourceBefore = source.quantity_on_hand;
    const sourceAfter = sourceBefore - params.quantity;
    const threshold = source.reorder_threshold;
    const destinationAfter = destination.quantity_on_hand + params.quantity;

    await trx("inventory_stock").where({ id: source.id }).update({ quantity_on_hand: sourceAfter });
    await trx("inventory_stock").where({ id: destination.id }).update({ quantity_on_hand: destinationAfter });

    await trx("inventory_transactions").insert({
      item_id: params.itemId,
      location_id: params.fromLocationId,
      quantity_delta: -params.quantity,
      quantity_after: sourceAfter,
      reason: "transfer_out",
      user_id: params.userId ?? null,
      notes: params.notes ?? null
    });

    await trx("inventory_transactions").insert({
      item_id: params.itemId,
      location_id: params.toLocationId,
      quantity_delta: params.quantity,
      quantity_after: destinationAfter,
      reason: "transfer_in",
      user_id: params.userId ?? null,
      notes: params.notes ?? null
    });

    // Only the source side can cross below its threshold from a transfer out — same
    // edge-triggered semantics as adjustStock().
    const crossedBelowThreshold = threshold > 0 && sourceBefore >= threshold && sourceAfter < threshold;

    return {
      ok: true,
      source: { id: source.id, quantity_on_hand: sourceAfter, reorder_threshold: threshold },
      destination: { id: destination.id, quantity_on_hand: destinationAfter },
      crossedBelowThreshold
    };
  });
}

export function listItems(includeInactive: boolean) {
  const query = db("inventory_items").select("*").orderBy("name", "asc");
  return includeInactive ? query : query.where({ active: true });
}

export function listStock(filters: { locationId?: number; itemId?: number } = {}) {
  let query = db("inventory_stock as s")
    .join("inventory_items as i", "i.id", "s.item_id")
    .join("locations as l", "l.id", "s.location_id")
    .select(
      "s.*",
      "i.name as item_name",
      "i.unit as item_unit",
      "l.name as location_name"
    )
    .orderBy(["l.name", "i.name"]);

  if (filters.locationId) query = query.where("s.location_id", filters.locationId);
  if (filters.itemId) query = query.where("s.item_id", filters.itemId);
  return query;
}

export function listTransactions(filters: { locationId?: number; itemId?: number; limit?: number } = {}) {
  let query = db("inventory_transactions as t")
    .join("inventory_items as i", "i.id", "t.item_id")
    .join("locations as l", "l.id", "t.location_id")
    .select(
      "t.*",
      "i.name as item_name",
      "i.unit as item_unit",
      "l.name as location_name"
    )
    .orderBy("t.created_at", "desc")
    .limit(filters.limit || 50);

  if (filters.locationId) query = query.where("t.location_id", filters.locationId);
  if (filters.itemId) query = query.where("t.item_id", filters.itemId);
  return query;
}
