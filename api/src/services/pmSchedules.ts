import { db } from "../db";

// Called either when Scott marks a PM schedule complete directly, or when the ticket
// the due-check cron created for it gets marked "done" — both close the same cycle.
export async function completeSchedule(
  scheduleId: number,
  opts: { ticketId?: number | null; notes?: string | null } = {}
): Promise<void> {
  const schedule = await db("pm_schedules").where({ id: scheduleId }).first();
  if (!schedule) return;

  const completedAt = new Date();
  const nextDueAt = new Date(completedAt.getTime() + schedule.interval_days * 24 * 60 * 60 * 1000);

  await db.transaction(async (trx) => {
    await trx("pm_completions").insert({
      pm_schedule_id: scheduleId,
      ticket_id: opts.ticketId ?? null,
      completed_at: completedAt,
      notes: opts.notes || null
    });

    await trx("pm_schedules").where({ id: scheduleId }).update({
      last_completed_at: completedAt,
      next_due_at: nextDueAt,
      current_ticket_id: null
    });
  });
}
