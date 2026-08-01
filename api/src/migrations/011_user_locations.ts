import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_locations", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable()
      .references("id").inTable("users").onDelete("CASCADE");
    table.integer("location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.unique(["user_id", "location_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("user_locations");
}
