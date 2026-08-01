import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("inventory_items", (table) => {
    table.string("part_number", 100);
    table.string("barcode", 100);
    table.unique(["barcode"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("inventory_items", (table) => {
    table.dropUnique(["barcode"]);
    table.dropColumn("barcode");
    table.dropColumn("part_number");
  });
}
