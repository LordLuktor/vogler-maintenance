import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tickets", (table) => {
    table.increments("id").primary();
    table.integer("location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("RESTRICT");
    table.integer("equipment_id").unsigned().nullable()
      .references("id").inTable("equipment").onDelete("SET NULL");
    table.text("description").notNullable();
    table.string("reporter_name");
    table.string("reporter_phone");
    table.enu("status", ["new", "acknowledged", "in_progress", "done"]).notNullable().defaultTo("new");
    table.enu("priority", ["low", "normal", "high", "urgent"]).notNullable().defaultTo("normal");
    table.enu("source", ["web", "sms", "pm"]).notNullable().defaultTo("web");
    table.timestamp("resolved_at");
    table.timestamps(true, true);

    table.index(["status"]);
    table.index(["location_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("tickets");
}
