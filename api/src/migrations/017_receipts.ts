import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("receipts", (table) => {
    table.increments("id").primary();
    // Kept even if the uploader's account is later removed — the receipt itself is the
    // record that matters, not who happens to still have a login.
    table.integer("uploaded_by").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.string("description", 500).notNullable();
    table.decimal("amount", 10, 2).notNullable();
    table.date("purchased_at").notNullable();
    table.timestamps(true, true);

    table.index(["purchased_at"]);
  });

  await knex.schema.createTable("receipt_files", (table) => {
    table.increments("id").primary();
    table.integer("receipt_id").unsigned().notNullable()
      .references("id").inTable("receipts").onDelete("CASCADE");
    // Random on-disk filename only — never the original filename — so nothing
    // user-supplied ends up in a filesystem path.
    table.string("stored_filename").notNullable();
    table.string("original_filename", 255);
    table.string("mime_type").notNullable();
    table.integer("size_bytes").notNullable();
    table.timestamp("uploaded_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("receipt_files");
  await knex.schema.dropTable("receipts");
}
