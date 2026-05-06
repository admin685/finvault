# FinVault Vercel Version

This is the deployable version of FinVault for GitHub + Vercel.

The local prototype in `finvault-system` uses PowerShell and a JSON file. Vercel cannot run that as a normal hosted app, so this version uses:

- Next.js frontend
- Next.js API routes
- Postgres via `DATABASE_URL`
- Stateless signed auth token via `AUTH_SECRET`

## Default Users

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Finance Manager | `finance` | `finance123` |
| Room M Manager | `supervisor` | `supervisor123` |
| Room T Manager | `supervisor_t` | `supervisor123` |
| Room T2 Manager | `supervisor_t2` | `supervisor123` |
| Agent | `daniel` | `agent123` |
| Agent | `anna` | `agent123` |
| Agent | `michael` | `agent123` |

Change these after first deployment.

## Environment Variables

Add these in Vercel Project Settings:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
AUTH_SECRET=replace-with-a-long-random-secret
POSTGRES_SSL=true
```

`AUTH_SECRET` should be a long random value.

## Deploy Through GitHub + Vercel

1. Create a new GitHub repository.
2. Upload or push only the `finvault-vercel` folder contents to that repository.
3. In Vercel, create a new project from that GitHub repository.
4. Add a Postgres database from Vercel Marketplace Storage, Neon, Supabase, or another provider.
5. Copy the database connection string into `DATABASE_URL`.
6. Add `AUTH_SECRET`.
7. Deploy.

## Important Notes

- Data is stored in a Postgres table called `finvault_store`.
- The first API request creates and seeds the database automatically.
- The Vercel version does not use local hourly JSON backups; use the backup tools from the Postgres provider.
- IP whitelist is off by default for web deployment. It can be enabled later from Admin.
- This is still an MVP architecture: fast to deploy, easy to review. Later, we should migrate from one JSONB store to normalized Postgres tables.
