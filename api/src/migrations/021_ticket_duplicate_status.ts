import type { Knex } from "knex";

// Same pattern as 020_ticket_rejected_status.ts — the status CHECK constraint has to be
// dropped and re-added to admit a new value.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tickets DROP CONSTRAINT tickets_status_check');
  await knex.raw(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
      CHECK (status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'in_progress'::text, 'done'::text, 'rejected'::text, 'duplicate'::text]))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex("tickets").where({ status: "duplicate" }).update({ status: "new" });
  await knex.raw('ALTER TABLE tickets DROP CONSTRAINT tickets_status_check');
  await knex.raw(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
      CHECK (status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'in_progress'::text, 'done'::text, 'rejected'::text]))`
  );
}
