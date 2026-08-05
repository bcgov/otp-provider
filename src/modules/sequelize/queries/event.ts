import { Transaction } from 'sequelize';
import { getEventModel } from '../models';

const eventModel = getEventModel();

type EventType = {
  eventType: string;
  clientId: string;
  email: string;
};

export const createEvent = async (event: EventType, transaction?: Transaction) => {
  return await eventModel.create(
    {
      eventType: event.eventType,
      clientId: event.clientId,
      email: event.email,
    },
    {
      transaction,
    },
  );
};
