import * as crypto from 'crypto';
import { config } from '../config';
import type { NextFunction, Response, Request } from 'express';

const { HASH_SALT } = config;

export const generateOtp = () => {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString().slice(-6);
};

export const isOtpValid = (otp: string, expiresAt: Date): boolean => {
  const currentTime = new Date();
  return otp.length === 6 && currentTime < expiresAt && /^\d+$/.test(otp);
};

export const isOrigin = (value: string) => {
  return typeof value === 'string' && URL.parse(value)?.origin === value;
};

export const hashEmail = (email: string) => {
  const salt = Buffer.from(HASH_SALT);
  const combined = Buffer.concat([Buffer.from(email, 'utf8'), salt]);
  return crypto.createHash('sha256').update(combined).digest('hex');
};

export const setNoCache = (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
};

export class LoginTimeoutError extends Error {
  status: number;
  constructor(
    message = 'Your session has timed out, please close this window and log in again using a new browser window',
  ) {
    super(message);
    this.name = 'LoginTimeoutError';
    this.status = 408;
    Object.setPrototypeOf(this, LoginTimeoutError.prototype);
  }
}

/*
  AWS API Gateway puts upstream connection headers in the forwarded header, in the format for=<public-ip>;host=<host>;....
  This function parses out parts and returns as an object.
*/
export function parseForwardedHeader(header?: string) {
  if (!header) return {};

  return Object.fromEntries(
    header.split(';').map((part) => {
      const [k, v] = part.split('=');
      return [k.trim(), v?.replace(/"/g, '')];
    }),
  );
}
