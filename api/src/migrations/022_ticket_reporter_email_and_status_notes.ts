import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tickets", (table) => {
    table.string("reporter_email");
    table.text("status_notes");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tickets", (table) => {
    table.dropColumn("reporter_email");
    table.dropColumn("status_notes");
  });
}
