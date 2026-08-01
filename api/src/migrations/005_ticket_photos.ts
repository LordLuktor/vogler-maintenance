import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ticket_photos", (table) => {
    table.increments("id").primary();
    table.integer("ticket_id").unsigned().notNullable()
      .references("id").inTable("tickets").onDelete("CASCADE");
    table.string("url").notNullable();
    table.string("mime_type").notNullable();
    table.integer("size_bytes").notNullable();
    table.timestamp("uploaded_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("ticket_photos");
}
