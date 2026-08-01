import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("receipts", (table) => {
    table.decimal("amount", 10, 2).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Any receipts saved without an amount while this migration was in effect would need
  // a value backfilled before the column could safely go NOT NULL again — not attempted
  // here since down-migrations on this project are only ever run in dev, never on data
  // that could actually contain such rows.
  await knex.schema.alterTable("receipts", (table) => {
    table.decimal("amount", 10, 2).notNullable().alter();
  });
}
