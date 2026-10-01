# Nex4LMS API

Private backend service for Nex4LMS, built with NestJS, TypeScript, Prisma and PostgreSQL.

## Local development

1. Copy `.env.example` to `.env` and replace the local values.
2. Install dependencies with `npm install`.
3. Generate the Prisma client with `npm run db:generate`.
4. Apply migrations with `npm run db:deploy`.
5. Start the API with `npm run start:dev`.

The default local API address is `http://localhost:4000/api/v1`.

## Branches

- `main` is production only.
- `develop` is the staging integration branch.
- New work uses `feature/*`, `fix/*`, `chore/*` and `release/*` branches.

Never commit `.env` files or production credentials.
