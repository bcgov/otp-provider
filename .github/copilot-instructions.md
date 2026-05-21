# otp-provider — AI Agent Instructions

Email-based OTP identity provider implementing OIDC via [node-oidc-provider v8](https://github.com/panva/node-oidc-provider). Users authenticate by entering their email address; an OTP is sent and validated, then the provider returns an identity assertion (used as an IdP behind Keycloak).

## Architecture

```
Client App → Keycloak (broker) → OTP Provider → Email OTP → OIDC token
```

**Stack:** TypeScript (ESM), Express 5, `oidc-provider` v8, Sequelize 6 + PostgreSQL, EJS views, Tailwind CSS, tsup bundler.

Key source layout:

- `src/config.ts` — all configuration (env vars with defaults)
- `src/app.ts` — Express app setup (Helmet CSP with per-request nonce, CORS, OIDC provider mount)
- `src/routes/interaction.ts` — OIDC interaction endpoints (`/:uid`, `/:uid/otp`, `/:uid/login`, `/:uid/abort`)
- `src/controllers/auth-controller.ts` — request handlers for the above routes
- `src/services/otp.ts` — OTP business logic (rate limiting, resend intervals, attempt counting)
- `src/modules/oidc-provider.ts` — `oidc-provider` configuration and client loader
- `src/modules/sequelize/` — DB config, Sequelize adapter for `oidc-provider`, models, queries, migrations
- `src/modules/errors.ts` — app-level error keys (`ErrorKeys` type)
- `src/client/` — browser-side TypeScript bundled separately (entry points: `otp.ts`, `signin.ts`, `expired.ts`, `shared.ts`)
- `src/views/` — EJS templates served by Express
- `src/mailer.ts` — email abstraction supporting CHES and AWS SES

## Commands

| Task                  | Command                                                |
| --------------------- | ------------------------------------------------------ |
| Install dependencies  | `yarn`                                                 |
| Dev server            | `yarn dev`                                             |
| Build (production)    | `yarn tailwind:build && yarn build`                    |
| Run server from build | `yarn start`                                           |
| Watch CSS             | `yarn tailwind`                                        |
| Unit tests            | `make test_db && make unit_test` (or just `yarn test`) |
| E2E tests             | `yarn test:e2e`                                        |
| E2E debug             | `yarn playwright test --debug`                         |

> **Important:** Run `yarn tailwind:build` before `yarn build` on a fresh checkout — the build will fail if `src/public/css/output.css` is missing.

## Database & Migrations

- PostgreSQL; managed with [Umzug](https://github.com/sequelize/umzug) via `src/modules/sequelize/umzug.ts`.
- Migration files live in `src/modules/sequelize/migrations/` using the naming pattern `NNN_description.ts`.
- When adding a migration, increment the prefix by 1. Migrations are **auto-discovered** by Umzug via glob — no explicit registration required.
- Running `DB_RUN_MIGRATIONS=true` (default) auto-migrates on app startup.
- The Sequelize adapter (`src/modules/sequelize/adapter.ts`) bridges `oidc-provider`'s storage interface to the DB models.

## Testing

**Unit tests** (Jest + supertest, run in-band):

- `make test_db` — creates and migrates the `otp_test` DB
- Test files in `src/__tests__/` are ordered: `01.db-setup.test.ts` must run first
- `NODE_ENV=test` skips real email sends and interprets OTP resend intervals as **seconds** (not minutes)

**E2E tests** (Playwright):

- Requires a seeded `otp_test` DB — see [README.md](../README.md#end-to-end-tests) for one-time setup
- Run `yarn test:e2e`; for debugging use `yarn playwright test --debug` with `test.only`
- The test server sets `NODE_ENV=test OTP_RESEND_INTERVAL_MINUTES=[2,3,3,4]` (values are seconds in test mode)

## Environment Variables

All config is in `src/config.ts`. Create `.env` from `.env.example` before starting locally.

Key variables:
| Variable | Purpose |
|----------|---------|
| `JWKS` | JSON Web Key Set (generate with `jwks-generator/` script) |
| `EMAIL_PROVIDER` | `ches` (default) or `ses` |
| `CHES_*` | CHES credentials (BC gov email service) |
| `OTP_RESEND_INTERVAL_MINUTES` | JSON array e.g. `[1,2,5,25]`; length = max resends |
| `OTP_VALIDITY_MINUTES` | How long an OTP is valid (default `5`) |
| `COOKIE_SECRETS` | Comma-separated secrets for Keygrip cookie signing |
| `HASH_SALT` | Salt for hashing emails |
| `DB_*` | PostgreSQL connection settings |

## Conventions

- **ESM only** (`"type": "module"` in package.json); use `import`/`export`, not `require`.
- **Error handling:** use `ErrorKeys` from `src/modules/errors.ts` for app-level errors; map `oidc-provider` errors in the interaction router.
- **CSP nonce:** `res.locals.cspNonce` is set per-request in `app.ts`; pass it to EJS templates for inline scripts.
- **Email:** always go through `src/mailer.ts`; `NODE_ENV=test` or `TEST_MODE=true` causes `sendEmail` to no-op.
- **Migrations:** never modify existing migration files; always add a new numbered migration.
- **Client-side code** in `src/client/` is bundled separately by tsup with `target: 'es2017'` and minification; do not use Node-only APIs there.
- Formatting is enforced by Prettier (`prettierrc`) and ESLint; pre-commit hooks run via `pre-commit` (Python).
