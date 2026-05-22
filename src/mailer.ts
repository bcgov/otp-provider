import axios from 'axios';
import logger from './modules/winston.config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { URLSearchParams } from 'node:url';
import { config } from './config';

const { EMAIL_PROVIDER, CHES_TOKEN_URL, CHES_API_URL, CHES_USERNAME, CHES_PASSWORD, MAIL_FROM } = config;

const sesClient = new SESClient({ region: process.env.AWS_REGION });

interface EmailOptions {
  from?: string;
  to: string[];
  body: string;
  bodyType?: string;
  cc?: string[];
  bcc?: string[];
  delayTS?: number;
  encoding?: string;
  priority?: 'normal' | 'low' | 'high';
  subject?: string;
  tag?: string;
}

export const sendEmail = async ({ to, body, subject, ...rest }: EmailOptions, maxRetries = 3) => {
  console.log('sendEmail called with:', { to, subject, ...rest });
  let attempt = 0;
  if (!to || !subject || !body) {
    throw new Error('to, subject, and body are required');
  }

  const from = MAIL_FROM;

  while (attempt < maxRetries) {
    try {
      switch (EMAIL_PROVIDER) {
        case 'ches':
          await sendEmailThroughChes({ from, to, subject, body, ...rest });
          break;
        case 'ses':
          await sendEmailThroughSES({ from, to, subject, body });
          break;
        default:
          throw new Error(`Unsupported email provider: ${EMAIL_PROVIDER}`);
      }
      break; // success, exit the retry loop
    } catch (error) {
      attempt++;
      logger.error(`Email send attempt ${attempt} failed: ${error}`);
      if (attempt >= maxRetries) {
        throw new Error(`Failed to send email after ${maxRetries} attempts`);
      }
    }
  }
};

const getChesToken = async () => {
  const params = new URLSearchParams({ grant_type: 'client_credentials' });
  try {
    const { data } = await axios.post(CHES_TOKEN_URL, params.toString(), {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: CHES_USERNAME,
        password: CHES_PASSWORD,
      },
    });

    const { access_token } = data as { access_token: string };
    return [access_token, null];
  } catch (err) {
    return [null, err];
  }
};

export const sendEmailThroughChes = async (email: EmailOptions) => {
  const { from, to, subject, body, ...rest } = email;
  const [accessToken, error] = await getChesToken();
  if (error) {
    throw new Error('unable to fetch ches token');
  }

  const res = await axios.post(
    CHES_API_URL,
    {
      // see https://ches.nrs.gov.bc.ca/api/v1/docs#operation/postEmail for options
      bodyType: 'html',
      body,
      encoding: 'utf-8',
      from,
      priority: 'normal',
      subject,
      to,
      ...rest,
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  return res;
};

export const sendEmailThroughSES = async (email: EmailOptions) => {
  const { from, to, subject, body } = email;
  const command = new SendEmailCommand({
    Source: from,
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

  await sesClient.send(command);
};
