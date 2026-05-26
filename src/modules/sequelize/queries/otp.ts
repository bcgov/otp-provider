import { FindOptions, Transaction } from 'sequelize';
import sequelize from '../config';
import { getOtpModel } from '../models';

const otpModel = getOtpModel();

export type OtpType = {
  id?: string;
  otp: string;
  email: string;
  clientId: string;
  attempts?: number;
  active?: boolean;
  updatedAt?: Date;
  createdAt?: Date;
};

export type ActiveOtpType = {
  id: string;
  otp: string;
  email: string;
  clientId: string;
  attempts: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type OtpCountAndRecentDateType = {
  otpCount: number;
  lastCreatedAt: Date | null;
};

export const createOtp = async (
  otp: Pick<OtpType, 'otp' | 'email' | 'clientId'>,
  transaction?: Transaction,
): Promise<ActiveOtpType> => {
  const createdOtp = await otpModel.create(
    {
      otp: otp.otp,
      email: otp.email,
      clientId: otp.clientId,
    },
    {
      transaction,
    },
  );
  return createdOtp.get({ plain: true }) as ActiveOtpType;
};

export const updateOtpAttempts = async (
  otp: Pick<OtpType, 'otp' | 'email' | 'clientId' | 'attempts'>,
  transaction?: Transaction,
) => {
  await otpModel.update(
    {
      attempts: otp.attempts,
      updatedAt: new Date(),
    },
    {
      where: { otp: otp.otp, email: otp.email, clientId: otp.clientId },
      transaction,
    },
  );
};

export const disableActiveOtp = async (email: string, clientId: string, transaction?: Transaction) => {
  await otpModel.update(
    {
      active: false,
      updatedAt: new Date(),
    },
    {
      where: { email, clientId },
      transaction,
    },
  );
};

export const deleteOtpsByEmail = async (email: string, clientId: string, transaction?: Transaction) => {
  await otpModel.destroy({
    where: { email, clientId },
    transaction,
  });
};

export const getActiveOtp = async (
  email: string,
  clientId: string,
  options: Omit<FindOptions, 'where' | 'raw'> = {},
): Promise<ActiveOtpType | null> => {
  return (await otpModel.findOne({
    where: {
      email,
      active: true,
      clientId,
    },
    raw: true,
    ...options,
  })) as ActiveOtpType | null;
};

export const getOtpCountAndRecentDate = async (
  email: string,
  clientId: string,
  transaction?: Transaction,
): Promise<OtpCountAndRecentDateType[]> => {
  const rows = (await otpModel.findAll({
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'otpCount'],
      [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastCreatedAt'],
    ],
    where: {
      email,
      clientId,
    },
    raw: true,
    transaction,
  })) as unknown as { otpCount: string | number; lastCreatedAt: Date | null }[];

  return rows.map((row) => ({
    otpCount: Number(row.otpCount),
    lastCreatedAt: row.lastCreatedAt,
  }));
};
