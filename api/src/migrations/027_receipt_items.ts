import type { Knex } from "knex";

// A receipt now covers one or more purchased line items instead of a single
// description/amount pair, so that an individual item (not the whole receipt) can later
// be marked as returned.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("receipt_items", (table) => {
    table.increments("id").primary();
    table.integer("receipt_id").unsigned().notNullable()
      .references("id").inTable("receipts").onDelete("CASCADE");
    table.string("description", 500).notNullable();
    table.decimal("amount", 10, 2).nullable();
    table.boolean("is_returned").notNullable().defaultTo(false);
    table.timestamp("returned_at").nullable();
    // Kept even if the marking user's account is later removed — same rationale as
    // receipts.uploaded_by.
    table.integer("returned_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.timestamps(true, true);

    table.index(["receipt_id"]);
  });

  // Every existing receipt becomes a single line item carrying its old description/amount,
  // so nothing uploaded before this migration loses its content.
  await knex.raw(`
    INSERT INTO receipt_items (receipt_id, description, amount, created_at, updated_at)
    SELECT id, description, amount, created_at, updated_at FROM receipts
  `);

  await knex.schema.alterTable("receipts", (table) => {
    table.dropColumn("description");
    table.dropColumn("amount");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("receipts", (table) => {
    table.string("description", 500).nullable();
    table.decimal("amount", 10, 2).nullable();
  });

  // Best-effort backfill from each receipt's first item only — down-migrations on this
  // project only ever run in dev, never against data a real rollback would need to preserve
  // exactly (see 018_receipt_amount_optional).
  await knex.raw(`
    UPDATE receipts r
    SET description = i.description, amount = i.amount
    FROM (
      SELECT DISTINCT ON (receipt_id) receipt_id, description, amount
      FROM receipt_items
      ORDER BY receipt_id, id
    ) i
    WHERE i.receipt_id = r.id
  `);

  await knex.schema.alterTable("receipts", (table) => {
    table.string("description", 500).notNullable().alter();
  });

  await knex.schema.dropTable("receipt_items");
}
