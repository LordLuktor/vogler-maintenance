import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("assets", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    // Where it lives when not in use — the tractor's home is a location it must be
    // transported from, distinct from wherever it's currently sitting.
    table.integer("home_location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.integer("current_location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.text("notes");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("assets");
}
