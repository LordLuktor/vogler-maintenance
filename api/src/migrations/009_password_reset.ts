import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.string("reset_token").unique();
    table.timestamp("reset_token_expires_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("reset_token");
    table.dropColumn("reset_token_expires_at");
  });
}
