import type { Knex } from "knex";

// The store's own PO / job tracking isn't available on every account, so a receipt carries
// its own reference (PO or ticket number) and the location the purchase was used at.
// Both nullable — receipts uploaded before this migration have neither.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("receipts", (table) => {
    table.string("reference_number", 100).nullable();
    // Kept as a plain receipt if the location is ever removed — same rationale as
    // receipts.uploaded_by.
    table.integer("location_id").unsigned().nullable()
      .references("id").inTable("locations").onDelete("SET NULL");

    table.index(["location_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("receipts", (table) => {
    table.dropColumn("location_id");
    table.dropColumn("reference_number");
  });
}
