import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("inventory_items", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("unit", 30).notNullable().defaultTo("each");
    table.text("notes");
    table.boolean("active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index(["active"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("inventory_items");
}
