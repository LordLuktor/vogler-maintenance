import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tickets", (table) => {
    table.string("issue_type", 50).notNullable().defaultTo("other");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tickets", (table) => {
    table.dropColumn("issue_type");
  });
}
