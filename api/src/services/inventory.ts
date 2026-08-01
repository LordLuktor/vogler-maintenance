import { db } from "../db";

export type InventoryReason = "restock" | "manual_adjustment" | "ticket_use" | "pm_use";

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
