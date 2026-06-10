import { FindOptions } from 'sequelize';
import models from '../models';

type InteractionType = {
  id: string;
  expiresAt: Date;
};

const interactionModel = models.get('Interaction');
if (!interactionModel) throw new Error('Model "Interaction" is not registered');

export const getInteractionById = async (
  id: string,
  options: Omit<FindOptions, 'where'> = {},
): Promise<InteractionType | null> => {
  return (await interactionModel.findOne({
    where: { id },
    ...options,
  })) as InteractionType | null;
};
