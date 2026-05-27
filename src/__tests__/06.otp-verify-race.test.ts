import crypto from 'node:crypto';
import sequelize from '../modules/sequelize/config';
import { acquireAdvisoryLock, requestOtp, verifyOtp } from '../services/otp';
import { cleanUpEvents, cleanUpOtps, getOtpsByEmail, fetchAttempts, fetchEvents } from './helpers/queries';
import { config } from '../config';

const clientId = 'pub-client';
const MAX_ATTEMPTS = Number.parseInt(config.OTP_ATTEMPTS_ALLOWED);

afterAll(async () => {
  await sequelize.close();
});

const insertActiveOtp = async (email: string, otp: string) => {
  await sequelize.query(
    `INSERT INTO public."Otp"("id", "otp", "email", "active", "clientId", "attempts")
     VALUES ('${crypto.randomUUID()}', :otp, :email, 'true', '${clientId}', 0)`,
    { replacements: { email, otp } },
  );
};

describe('verifyOtp attempt limit under concurrency', () => {
  afterEach(async () => {
    await cleanUpOtps();
    await cleanUpEvents();
  });

  it('serializes concurrent verify calls', async () => {
    await insertActiveOtp('email', '111111');

    // Send 5-fold more than the limit concurrent requests to verifyOtp to test locking
    const concurrentHits = MAX_ATTEMPTS * 5;
    const otpVerifications = [];
    for (let i = 0; i < concurrentHits; i++) {
      otpVerifications.push(verifyOtp('email', '222222', clientId));
    }
    await Promise.all(otpVerifications);

    const attempts = await fetchAttempts('email');
    const maxAttemptEvents = await fetchEvents('email', clientId, 'MAX_ATTEMPTS');

    expect(attempts).toBe(MAX_ATTEMPTS);
    // Test all additional hits were blocked and logged the max_attempts event
    expect(maxAttemptEvents.length).toBe(concurrentHits - MAX_ATTEMPTS);
  });
});

describe('serializes concurrent OTP request calls', () => {
  beforeEach(async () => {
    await cleanUpOtps();
    await cleanUpEvents();
  });

  afterEach(async () => {
    await cleanUpOtps();
    await cleanUpEvents();
  });

  it('serializes concurrent request OTP calls so additional OTPs cannot be generated', async () => {
    const concurrentHits = 10;
    const otpRequests = [];
    for (let i = 0; i < concurrentHits; i++) {
      otpRequests.push(
        requestOtp('email', clientId).then((req) => {
          const { transaction } = req;
          return transaction.commit().then(() => req);
        }),
      );
    }
    const resolvedRequests = await Promise.all(otpRequests);

    const otps = await getOtpsByEmail('email');

    expect(otps.length).toBe(1);

    // Only first request should go through, all subsequent blocked with error
    resolvedRequests.forEach((req, i) => {
      if (i === 0) {
        expect(req.error).toBeFalsy();
        expect(req.newOtp).not.toBeNull();
      } else {
        expect(req.error).toBe('RESEND_TIMEOUT');
        expect(req.newOtp).toBeNull();
      }
    });
  });
});

describe('Lockout Handling', () => {
  afterEach(async () => {
    await cleanUpOtps();
    await cleanUpEvents();
  });

  it('Waits for lock release before allowing same client/email combo to request an OTP', async () => {
    // Create an advisory lock
    const transaction = await sequelize.transaction();
    await acquireAdvisoryLock('email', 'client', transaction);
    let otpPromiseSettled = false;

    // This promise should be blocked due to advisory lock
    requestOtp('email', 'client').then(async ({ transaction }) => {
      await transaction.commit();
      otpPromiseSettled = true;
    });

    // Give some time to potentially settle
    await new Promise((r) => setTimeout(r, 200));

    // Blocked by transaction
    expect(otpPromiseSettled).toBe(false);

    // Verify clearing transaction allows promise to proceed
    await transaction.commit();
    await new Promise((r) => setTimeout(r, 200));
    expect(otpPromiseSettled).toBe(true);
  });

  it('Only locks the email client ID combo and allows other requests', async () => {
    const transaction = await sequelize.transaction();
    await acquireAdvisoryLock('email', 'client', transaction);

    // Will hang and fail test if locked
    const { transaction: requestOtpTransaction } = await requestOtp('email2', 'client');

    // Commit transactions to allow test to exit
    await transaction.commit();
    await requestOtpTransaction.commit();
  });
});
