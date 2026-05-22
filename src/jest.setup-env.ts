import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = privateKey.export({ format: 'jwk' }) as Record<string, string>;
jwk.kid = randomBytes(16).toString('hex');
jwk.use = 'sig';
jwk.alg = 'RS256';

process.env.JWKS = JSON.stringify({ keys: [jwk] });
process.env.DB_NAME = 'otp_test';
process.env.NODE_ENV = 'test';
process.env.DB_RUN_MIGRATIONS = 'false';
process.env.APP_URL = 'http://localhost:3000';
