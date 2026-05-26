---
description: 'Scaffold a new Sequelize/Umzug migration file for otp-provider. Use when: adding a column, creating a table, dropping an index, or any schema change.'
argument-hint: "Brief description of the schema change, e.g. 'add verified_at to Otp table'"
mode: 'agent'
---

Create a new Sequelize migration for the otp-provider project.

## Step 1 — Determine the next migration number

List the files in [src/modules/sequelize/migrations/](../src/modules/sequelize/migrations/) and find the highest `NNN` prefix. The new migration number is that value + 1, zero-padded to 3 digits (e.g. if the last is `018`, the new one is `019`).

## Step 2 — Choose a file name

Build the filename: `NNN_<snake_case_description>.ts`
The `name` const inside the file must exactly match the filename without the `.ts` extension.

Schema change requested: **$ARGUMENTS**

## Step 3 — Create the migration file

Create `src/modules/sequelize/migrations/NNN_<description>.ts` using this structure:

```ts
import { QueryInterface, DataTypes, Sequelize } from 'sequelize';

const name = 'NNN_<description>';

const tableName = '<TableName>';

export const up = async (queryInterface: QueryInterface) => {
  // implement the forward migration
};

export const down = async (queryInterface: QueryInterface) => {
  // implement the rollback (mirror of up)
};

export default { name, up, down };
```

**Rules:**

- Import only what is needed from `sequelize` (`DataTypes`, `Sequelize`, `QueryInterface`)
- Always implement both `up` **and** `down`; `down` must be a clean rollback of `up`
- Use `DataTypes.DATE(3)` with `defaultValue: Sequelize.fn('NOW')` for timestamp columns
- Primary keys on oidc-provider tables use `DataTypes.STRING` (UUID); app-owned tables use `DataTypes.INTEGER` with `autoIncrement: true`
- **Never modify an existing migration file** — always add a new one
- Migrations are auto-discovered by Umzug via glob; no registration is required

## Step 4 — Update models if needed

If the migration creates a **new table**, check [src/modules/sequelize/models.ts](../src/modules/sequelize/models.ts) and add the new model definition there.

## Step 5 — Confirm

Show the created file path and its full contents.
