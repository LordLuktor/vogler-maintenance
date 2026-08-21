import type { Knex } from "knex";

// A tech can log a part from any location they can access — not just the ticket's own
// location (e.g. pulling a part off their truck's stock for a job at a store) — so the
// same item can now appear on one ticket sourced from two different locations. The old
// (ticket_id, item_id) uniqueness collapsed those into one row with a single location_id,
// which made editing/removing credit stock back to the wrong place. Widening to
// (ticket_id, item_id, location_id) keeps one row per distinct source.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ticket_parts", (table) => {
    table.dropUnique(["ticket_id", "item_id"]);
    table.unique(["ticket_id", "item_id", "location_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ticket_parts", (table) => {
    table.dropUnique(["ticket_id", "item_id", "location_id"]);
    table.unique(["ticket_id", "item_id"]);
  });
}
