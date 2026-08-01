import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("inventory_stock", (table) => {
    table.increments("id").primary();
    table.integer("item_id").unsigned().notNullable()
      .references("id").inTable("inventory_items").onDelete("CASCADE");
    table.integer("location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.integer("quantity_on_hand").notNullable().defaultTo(0);
    // 0 means "not opted into low-stock alerts" for this item at this location.
    table.integer("reorder_threshold").notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.unique(["item_id", "location_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("inventory_stock");
}
