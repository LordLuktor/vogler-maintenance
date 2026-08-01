import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("pm_completions", (table) => {
    table.increments("id").primary();
    table.integer("pm_schedule_id").unsigned().notNullable()
      .references("id").inTable("pm_schedules").onDelete("CASCADE");
    table.integer("ticket_id").unsigned().nullable()
      .references("id").inTable("tickets").onDelete("SET NULL");
    table.timestamp("completed_at").notNullable().defaultTo(knex.fn.now());
    table.text("notes");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("pm_completions");
}
