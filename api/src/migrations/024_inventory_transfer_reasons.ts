import type { Knex } from "knex";

// inventory_transactions.reason is a plain text column with a Postgres CHECK constraint
// (knex's default for .enu() on this project, not a native pg enum type, per the same
// pattern as 020_ticket_rejected_status.ts) — adding values means dropping and re-adding
// the constraint rather than an ALTER TYPE.
export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE inventory_transactions DROP CONSTRAINT inventory_transactions_reason_check");
  await knex.raw(
    `ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_reason_check
      CHECK (reason = ANY (ARRAY['restock'::text, 'manual_adjustment'::text, 'ticket_use'::text, 'pm_use'::text, 'transfer_out'::text, 'transfer_in'::text]))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex("inventory_transactions").where("reason", "in", ["transfer_out", "transfer_in"]).del();
  await knex.raw("ALTER TABLE inventory_transactions DROP CONSTRAINT inventory_transactions_reason_check");
  await knex.raw(
    `ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_reason_check
      CHECK (reason = ANY (ARRAY['restock'::text, 'manual_adjustment'::text, 'ticket_use'::text, 'pm_use'::text]))`
  );
}
