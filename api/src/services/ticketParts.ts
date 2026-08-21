import { db } from "../db";
import { adjustStock } from "./inventory";

export function listTicketParts(ticketId: number) {
  return db("ticket_parts as tp")
    .join("inventory_items as i", "i.id", "tp.item_id")
    .join("locations as l", "l.id", "tp.location_id")
    .select(
      "tp.id",
      "tp.item_id",
      "i.name as item_name",
      "i.unit as item_unit",
      "tp.location_id",
      "l.name as location_name",
      "tp.quantity",
      "tp.notes",
      "tp.created_at",
      "tp.updated_at"
    )
    .where("tp.ticket_id", ticketId)
    .orderBy("tp.created_at", "asc");
}

export interface LogPartParams {
  ticketId: number;
  itemId: number;
  locationId: number;
  quantity: number;
  notes?: string | null;
  userId?: number | null;
}

export interface LogPartResult {
  crossedBelowThreshold: boolean;
  quantityOnHand: number;
  reorderThreshold: number;
}

/**
 * Adds to (or, if this exact item+source-location is already on the ticket, increases)
 * the ticket's parts list, and decrements stock by the same amount through the normal
 * adjustStock ledger — same "restock/6 at once" quantity field as everywhere else, not
 * six separate clicks. One row per (ticket, item, location): a tech can log the same
 * part twice from two different sources (e.g. some from the store, more from their
 * truck) without one overwriting the other's location — but using it again from the
 * *same* source just bumps that row's quantity rather than creating a duplicate line.
 *
 * Returns null if the item isn't tracked at the given location yet — caller decides how
 * to surface that (previously this silently no-op'd the stock decrement while still
 * reporting success, which is exactly the kind of drift a ticket_parts row must not be
 * allowed to have relative to the real stock ledger).
 */
export async function logTicketPart(params: LogPartParams): Promise<LogPartResult | null> {
  const result = await adjustStock({
    itemId: params.itemId,
    locationId: params.locationId,
    delta: -params.quantity,
    reason: "ticket_use",
    ticketId: params.ticketId,
    userId: params.userId ?? null,
    notes: params.notes ?? null
  });
  if (!result) return null;

  const existing = await db("ticket_parts")
    .where({ ticket_id: params.ticketId, item_id: params.itemId, location_id: params.locationId })
    .first();
  if (existing) {
    await db("ticket_parts")
      .where({ id: existing.id })
      .update({
        quantity: existing.quantity + params.quantity,
        notes: params.notes ?? existing.notes,
        user_id: params.userId ?? existing.user_id,
        updated_at: db.fn.now()
      });
  } else {
    await db("ticket_parts").insert({
      ticket_id: params.ticketId,
      item_id: params.itemId,
      location_id: params.locationId,
      quantity: params.quantity,
      notes: params.notes ?? null,
      user_id: params.userId ?? null
    });
  }

  return {
    crossedBelowThreshold: result.crossedBelowThreshold,
    quantityOnHand: result.stock.quantity_on_hand,
    reorderThreshold: result.stock.reorder_threshold
  };
}

export type TicketPartMutationResult =
  | { ok: true; crossedBelowThreshold: boolean; quantityOnHand: number; reorderThreshold: number }
  | { ok: false; error: "not_found" };

/**
 * Corrects a previously-logged quantity in place — the whole point being that fixing
 * a mislogged "1" to the actual "6" is one edit, not five more usage entries. The
 * difference between old and new quantity is applied to stock as a normal
 * adjustStock() delta (positive if lowering the logged quantity hands stock back,
 * negative if raising it takes more), so the underlying ledger stays accurate without
 * having to touch any historical transaction row.
 */
export async function updateTicketPartQuantity(
  partId: number,
  newQuantity: number,
  userId?: number | null
): Promise<TicketPartMutationResult> {
  const part = await db("ticket_parts").where({ id: partId }).first();
  if (!part) return { ok: false, error: "not_found" };

  const delta = newQuantity - part.quantity;
  let crossedBelowThreshold = false;
  let quantityOnHand = null as number | null;
  let reorderThreshold = null as number | null;

  if (delta !== 0) {
    const result = await adjustStock({
      itemId: part.item_id,
      locationId: part.location_id,
      delta: -delta,
      reason: "ticket_use",
      ticketId: part.ticket_id,
      userId: userId ?? null,
      notes: "Corrected quantity"
    });
    crossedBelowThreshold = Boolean(result?.crossedBelowThreshold);
    quantityOnHand = result?.stock.quantity_on_hand ?? null;
    reorderThreshold = result?.stock.reorder_threshold ?? null;
  }

  await db("ticket_parts").where({ id: partId }).update({ quantity: newQuantity, updated_at: db.fn.now() });

  return { ok: true, crossedBelowThreshold, quantityOnHand: quantityOnHand ?? part.quantity, reorderThreshold: reorderThreshold ?? 0 };
}

/** Removes a part line entirely and hands its full quantity back to stock. */
export async function removeTicketPart(partId: number, userId?: number | null): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const part = await db("ticket_parts").where({ id: partId }).first();
  if (!part) return { ok: false, error: "not_found" };

  await adjustStock({
    itemId: part.item_id,
    locationId: part.location_id,
    delta: part.quantity,
    reason: "ticket_use",
    ticketId: part.ticket_id,
    userId: userId ?? null,
    notes: "Removed from ticket"
  });

  await db("ticket_parts").where({ id: partId }).del();
  return { ok: true };
}
