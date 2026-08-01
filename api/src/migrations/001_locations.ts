import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("locations", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("type").notNullable(); // dealership, body_shop, parts_store
    table.string("address");
    table.string("contact_name");
    table.string("contact_phone");
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("locations");
}
