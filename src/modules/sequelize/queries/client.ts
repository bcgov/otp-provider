import { FindOptions } from 'sequelize';
import { getClientConfigModel } from '../models';

const clientConfigModel = getClientConfigModel();

export const getClients = async (
  attributes: string[] = [],
  options: Omit<FindOptions, 'attributes'> = { raw: true },
) => {
  return await clientConfigModel.findAll({
    attributes,
    ...options,
  });
};
