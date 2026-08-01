import type { Knex } from "knex";

// Seed data is a starting point — edit names/addresses/contacts from the dashboard once real details are confirmed.
export async function seed(knex: Knex): Promise<void> {
  await knex("locations").del();
  await knex("locations").insert([
    { name: "Dealership 1", type: "dealership" },
    { name: "Dealership 2", type: "dealership" },
    { name: "Body Shop", type: "body_shop" },
    { name: "Parts Store 1", type: "parts_store" },
    { name: "Parts Store 2", type: "parts_store" },
    { name: "Parts Store 3", type: "parts_store" },
    { name: "Parts Store 4", type: "parts_store" },
    { name: "Parts Store 5", type: "parts_store" }
  ]);
}
