import { config } from '../config';
import { generateOtp } from '../utils/helpers';
import sequelize from '../modules/sequelize/config';
import { getOtpModel } from '../modules/sequelize/models';
import {
  createOtp,
  deleteOtpsByEmail,
  disableActiveOtp,
  getActiveOtp,
  getOtpCountAndRecentDate,
  updateOtpAttempts,
} from '../modules/sequelize/queries/otp';
import { createEvent } from '../modules/sequelize/queries/event';
import { QueryTypes, Transaction } from 'sequelize';
import { createHash } from 'node:crypto';

const { OTP_RESEND_INTERVAL_MINUTES, OTP_ATTEMPTS_ALLOWED, NODE_ENV } = config;
const otpAttemptsAllowed = parseInt(OTP_ATTEMPTS_ALLOWED, 10);
const otpModel = getOtpModel();

const otpResendIntervalMinutes = JSON.parse(OTP_RESEND_INTERVAL_MINUTES || '[]');

/**
 * Generate a stable advisory lock ID from email and clientId.
 */
const getAdvisoryLockId = (email: string, clientId: string): string => {
  const hash = createHash('sha256').update(`${email}:${clientId}`).digest();
  // Convert first 8 bytes to a JavaScript safe integer
  return hash.readBigInt64BE(0).toString();
};

/**
 * Acquire an advisory lock for the given email/clientId combination.
 * The lock is held for the duration of the transaction.
 */
export const acquireAdvisoryLock = async (email: string, clientId: string, transaction: Transaction) => {
  const lockId = getAdvisoryLockId(email, clientId);
  await sequelize.query('SELECT pg_advisory_xact_lock(:lockId)', {
    transaction,
    type: QueryTypes.SELECT,
    replacements: { lockId },
  });
};

export const requestOtp = async (email: string, clientId: string) => {
  const transaction = await sequelize.transaction();
  let response: { error: string; newOtp: string | null; transaction: Transaction } = {
    error: '',
    newOtp: null,
    transaction,
  };
  try {
    await acquireAdvisoryLock(email, clientId, transaction);
    const otps = await getOtpCountAndRecentDate(email, clientId, transaction);

    if (otps[0].otpCount > otpResendIntervalMinutes.length) {
      await createEvent(
        {
          eventType: 'MAX_RESENDS',
          clientId,
          email,
        },
        transaction,
      );
      response.error = 'OTPS_LIMIT_REACHED';
    } else if (otps[0].otpCount === 0) {
      await createEvent(
        {
          eventType: 'REQUEST_OTP',
          clientId,
          email,
        },
        transaction,
      );

      const otp = await createOtp({ otp: generateOtp(), email, clientId }, transaction);
      response.newOtp = otp.otp;
    } else {
      const currentWaitSeconds = await getOtpWaitTime(email, clientId, transaction);
      if (currentWaitSeconds === 0) {
        await createEvent(
          {
            eventType: 'RESEND_OTP',
            clientId,
            email,
          },
          transaction,
        );
        await disableActiveOtp(email, clientId, transaction);
        const otp = await createOtp({ otp: generateOtp(), email, clientId }, transaction);
        response.newOtp = otp.otp;
      } else {
        response = { ...response, error: 'RESEND_TIMEOUT' };
      }
    }
    return response;
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    throw new Error('Failed to create OTP');
  }
};

//delayMultiplier: seconds per minute to wait on code resends. Can be reduced in test and local environments to avoid long delays. E.g. set to 1 in test workflows to delay in seconds and not minutes.
export const getOtpWaitTime = async (email: string, clientId: string, transaction?: Transaction) => {
  const delayMultiplier = NODE_ENV === 'test' ? 2 : 60;

  const otps = await getOtpCountAndRecentDate(email, clientId, transaction);

  if (otps[0].otpCount === 0) return Number.parseInt(otpResendIntervalMinutes[0]) * delayMultiplier;
  else if (otps[0].otpCount > otpResendIntervalMinutes.length) return -1;

  const lastCreatedAt = otps[0].lastCreatedAt;
  if (!lastCreatedAt) throw new Error('no creation date for OTP');
  const secondsElapsedSinceLastRequest = Math.ceil((Date.now() - lastCreatedAt.getTime()) / 1000);

  return Math.max(
    parseInt(otpResendIntervalMinutes[otps[0].otpCount - 1]) * delayMultiplier - secondsElapsedSinceLastRequest,
    0,
  );
};

export const verifyOtp = async (email: string, otp: string, clientId: string) => {
  let response = { waitTime: 0, error: '' };
  const transaction = await sequelize.transaction();
  try {
    // Acquire advisory lock to serialize concurrent verify attempts
    await acquireAdvisoryLock(email, clientId, transaction);

    let activeOtp = await getActiveOtp(email, clientId, { transaction });
    if (process.env.TEST_MODE === 'true') {
      activeOtp = otpModel.build({
        id: '1',
        otp: '111111',
        email,
        clientId,
        attempts: 0,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    if (!activeOtp) {
      await createEvent(
        {
          eventType: 'NO_ACTIVE_OTP',
          clientId,
          email,
        },
        transaction,
      );

      response.error = 'NO_ACTIVE_OTP';
    } else if (activeOtp.attempts >= otpAttemptsAllowed) {
      await Promise.all(
        ['INVALID_OTP', 'MAX_ATTEMPTS'].map(async (eventType) => {
          await createEvent(
            {
              eventType,
              clientId,
              email,
            },
            transaction,
          );
        }),
      );
      response.waitTime = await getOtpWaitTime(email, clientId, transaction);
      response.error = 'EXPIRED_OTP_WITH_RESEND';
    } else if (activeOtp.otp !== otp) {
      await updateOtpAttempts({ otp: activeOtp.otp, email, clientId, attempts: activeOtp.attempts + 1 }, transaction);
      await createEvent(
        {
          eventType: 'INVALID_OTP',
          clientId,
          email,
        },
        transaction,
      );
      response.waitTime = await getOtpWaitTime(email, clientId, transaction);
      response.error = 'INVALID_OTP';
    } else if (
      new Date(activeOtp.createdAt).getTime() + parseInt(config.OTP_VALIDITY_MINUTES) * 60 * 1000 <
      new Date().getTime()
    ) {
      await createEvent(
        {
          eventType: 'EXPIRED_OTP',
          clientId,
          email,
        },
        transaction,
      );
      response.waitTime = await getOtpWaitTime(email, clientId, transaction);
      response.error = 'EXPIRED_OTP';
    } else {
      await deleteOtpsByEmail(email, clientId, transaction);

      await createEvent(
        {
          eventType: 'OTP_VERIFIED',
          clientId,
          email,
        },
        transaction,
      );
    }
    await transaction.commit();
    return response;
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    throw new Error('Failed to verify OTP');
  }
};
