import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("pm_schedules", (table) => {
    table.increments("id").primary();
    table.integer("location_id").unsigned().notNullable()
      .references("id").inTable("locations").onDelete("CASCADE");
    table.integer("equipment_id").unsigned().nullable()
      .references("id").inTable("equipment").onDelete("CASCADE");
    table.string("title").notNullable();
    table.string("issue_type", 50).notNullable();
    table.enu("priority", ["low", "normal", "high", "urgent"]).notNullable().defaultTo("normal");
    table.integer("interval_days").unsigned().notNullable();
    table.timestamp("next_due_at").notNullable();
    table.timestamp("last_completed_at");
    // Points at the currently-open ticket the due-check cron created for this schedule,
    // so the cron doesn't spam a new ticket every day while the last one is still unresolved.
    table.integer("current_ticket_id").unsigned().nullable()
      .references("id").inTable("tickets").onDelete("SET NULL");
    table.boolean("active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index(["active", "next_due_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("pm_schedules");
}
