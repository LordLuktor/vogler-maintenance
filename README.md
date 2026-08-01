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
