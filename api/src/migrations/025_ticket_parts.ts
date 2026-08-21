import type { Knex } from "knex";

// The "current state" of what parts are on a ticket — one row per (ticket, item),
// editable after the fact. inventory_transactions stays the append-only stock
// ledger (still gets a transfer_out-style row per correction); this table is what
// the ticket detail page actually renders and lets an admin edit/remove.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ticket_parts", (table) => {
    table.increments("id").primary();
    table.integer("ticket_id").unsigned().notNullable()
      .references("id").inTable("tickets").onDelete("CASCADE");
    table.integer("item_id").unsigned().notNullable()
      .references("id").inTable("inventory_items").onDelete("CASCADE");
    // Stock was decremented from the ticket's location at the time of logging — stored
    // here (not re-read from tickets.location_id) so an edit/removal always credits
    // back the same stock row it was taken from, even if the ticket is later reassigned
    // to a different location.
    table.integer("location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.integer("quantity").notNullable();
    table.text("notes");
    table.integer("user_id").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.timestamps(true, true);

    table.unique(["ticket_id", "item_id"]);
  });

  // Backfill from history: inventory_transactions already has every ticket_use decrement
  // ever logged (reason='ticket_use', ticket_id set) — this table is new, so without this,
  // every ticket that already had parts logged before today would show an empty "Parts
  // used" list despite stock having actually been decremented for it.
  await knex.raw(`
    INSERT INTO ticket_parts (ticket_id, item_id, location_id, quantity, user_id, created_at, updated_at)
    SELECT
      t1.ticket_id,
      t1.item_id,
      (SELECT t2.location_id FROM inventory_transactions t2
        WHERE t2.ticket_id = t1.ticket_id AND t2.item_id = t1.item_id AND t2.reason = 'ticket_use'
        ORDER BY t2.created_at DESC LIMIT 1),
      SUM(-t1.quantity_delta),
      (SELECT t3.user_id FROM inventory_transactions t3
        WHERE t3.ticket_id = t1.ticket_id AND t3.item_id = t1.item_id AND t3.reason = 'ticket_use'
        ORDER BY t3.created_at DESC LIMIT 1),
      MIN(t1.created_at),
      MAX(t1.created_at)
    FROM inventory_transactions t1
    WHERE t1.reason = 'ticket_use' AND t1.ticket_id IS NOT NULL
    GROUP BY t1.ticket_id, t1.item_id
    HAVING SUM(-t1.quantity_delta) > 0
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("ticket_parts");
}
