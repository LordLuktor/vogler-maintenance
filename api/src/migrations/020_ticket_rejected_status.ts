import type { Knex } from "knex";

// tickets.status is a plain text column with a Postgres CHECK constraint (knex's default
// for .enu() on this project, not a native pg enum type) — adding a value means dropping
// and re-adding the constraint rather than an ALTER TYPE.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE tickets DROP CONSTRAINT tickets_status_check');
  await knex.raw(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
      CHECK (status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'in_progress'::text, 'done'::text, 'rejected'::text]))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex("tickets").where({ status: "rejected" }).update({ status: "new" });
  await knex.raw('ALTER TABLE tickets DROP CONSTRAINT tickets_status_check');
  await knex.raw(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
      CHECK (status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'in_progress'::text, 'done'::text]))`
  );
}
