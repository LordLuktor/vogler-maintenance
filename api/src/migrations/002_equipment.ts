import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("equipment", (table) => {
    table.increments("id").primary();
    table.integer("location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.string("name").notNullable();
    table.string("category"); // lift, hvac, compressor, etc.
    table.date("install_date");
    table.text("notes");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("equipment");
}
