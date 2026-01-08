import logger from './modules/winston.config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({ region: process.env.AWS_REGION });

interface EmailOptions {
  from?: string;
  to: string[];
  body: string;
  subject?: string;
}

export const sendEmail = async (
  { from = 'do-not-reply@otp.gov.bc.ca', to, body, subject }: EmailOptions,
  maxRetries = 3,
) => {
  try {
    if (process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test') return true;
    let attempt = 0;
    if (!to || !subject || !body) {
      throw new Error('to, subject, and body are required');
    }

    const source = from || process.env.MAIL_FROM;
    if (!source) {
      throw new Error('Missing from address (MAIL_FROM env or parameter)');
    }

    const command = new SendEmailCommand({
      Source: source,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: body,
            Charset: 'UTF-8',
          },
        },
      },
    });

    while (attempt < maxRetries) {
      try {
        const result = await sesClient.send(command);
        return result.MessageId;
      } catch (error) {
        attempt++;
        logger.warn(`Email send attempt ${attempt} failed: ${error}`);
        if (attempt >= maxRetries) {
          throw new Error(`Failed to send email after ${maxRetries} attempts`);
        }
      }
    }
  } catch (err) {
    logger.error(err);
  }
};
