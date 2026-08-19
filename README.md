# Vogler Maintenance

A maintenance-ticket platform built for a multi-location dealership/parts group. Staff at any location report an issue through a no-login web form (SMS as a planned fallback); a central dashboard tracks tickets, per-location equipment, and preventive-maintenance schedules.

Built solo, end to end: API, dashboard, database schema, and deployment.

**Stack**
- `api/` — Express + TypeScript + Knex + PostgreSQL + Redis
- `web/` — React + Vite + TypeScript

**Highlights**
- Anonymous public ticket-reporting flow, no account required
- Role-based dashboard access — admin vs. location-scoped viewer, fails closed by default
- Preventive-maintenance scheduling with automatic recurring ticket generation
- Deployed as a Docker Swarm stack behind Traefik, with secrets managed outside the image

Location names in the seed data and screenshots are placeholders — the real deployment runs against the actual client's site list.

Live case study: [scottsteinmetz.biz/case-studies](https://scottsteinmetz.biz/case-studies)

---

**Note for future updates:** this working tree *is* the deploy source — changes are built and pushed to the Swarm stack directly from here (`docker build` + `docker service update`), not from `origin`. That means it's easy for this git history to silently fall behind what's actually live. **Every change that gets deployed must also be committed and pushed here in the same pass** — don't treat the deploy and the repo update as separate/optional steps. Before pushing any update, re-check for real client location names and credentials — nothing in the working copy should identify the actual client sites beyond what's already public knowledge.
