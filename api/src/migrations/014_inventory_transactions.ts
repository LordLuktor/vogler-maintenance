import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("inventory_transactions", (table) => {
    table.increments("id").primary();
    table.integer("item_id").unsigned().notNullable()
      .references("id").inTable("inventory_items").onDelete("CASCADE");
    // Stored directly (not just derivable via inventory_stock) so history survives
    // independent of the stock row's lifecycle.
    table.integer("location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.integer("quantity_delta").notNullable();
    table.integer("quantity_after").notNullable();
    table.enu("reason", ["restock", "manual_adjustment", "ticket_use", "pm_use"]).notNullable();
    table.integer("ticket_id").unsigned().nullable()
      .references("id").inTable("tickets").onDelete("SET NULL");
    table.integer("pm_schedule_id").unsigned().nullable()
      .references("id").inTable("pm_schedules").onDelete("SET NULL");
    table.integer("user_id").unsigned().nullable()
      .references("id").inTable("users").onDelete("SET NULL");
    table.text("notes");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["item_id", "location_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("inventory_transactions");
}
