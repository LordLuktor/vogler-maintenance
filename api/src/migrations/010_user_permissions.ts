import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.boolean("is_admin").notNullable().defaultTo(false);
    table.boolean("all_locations").notNullable().defaultTo(false);
  });

  // Backfill: any user that already exists predates this permission model — grant full
  // access so existing accounts (Scott's) don't regress.
  await knex("users").update({ is_admin: true, all_locations: true });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("is_admin");
    table.dropColumn("all_locations");
  });
}
