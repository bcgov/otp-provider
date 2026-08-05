import { Client } from 'pg';

const dbName = process.env.DB_NAME || 'otp_test';

const getClient = async () => {
  const client = new Client({
    host: process.env.DB_HOSTNAME || 'localhost',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: dbName,
    port: Number(process.env.DB_PORT) || 5432,
  });
  await client.connect();
  return client;
};

const withClient = async <T>(fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = await getClient();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

export const cleanupOtps = () => withClient((c) => c.query('DELETE FROM public."Otp"').then(() => undefined));

export const cleanupEvents = () => withClient((c) => c.query('DELETE FROM public."Event"').then(() => undefined));

export const findEvents = (email: string, clientId: string, eventType: string) =>
  withClient((c) =>
    c
      .query('SELECT * FROM public."Event" WHERE email=$1 AND "clientId"=$2 AND "eventType"=$3', [
        email,
        clientId,
        eventType,
      ])
      .then((r) => r.rows),
  );

export const findActiveOtp = (email: string) =>
  withClient((c) =>
    c
      .query('SELECT * FROM public."Otp" WHERE email=$1 AND active=true LIMIT 1', [email])
      .then((r) => r.rows[0] ?? null),
  );

export const updateOtp = (id: string, fields: Record<string, unknown>) => {
  const keys = Object.keys(fields);
  const setClauses = keys.map((k, i) => `"${k}"=$${i + 2}`).join(', ');
  const values = [id, ...Object.values(fields)];
  return withClient((c) => c.query(`UPDATE public."Otp" SET ${setClauses} WHERE id=$1`, values).then(() => undefined));
};
