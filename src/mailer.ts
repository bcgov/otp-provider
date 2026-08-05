import axios from 'axios';
import logger from './modules/winston.config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { URLSearchParams } from 'node:url';
import { config } from './config';

const { EMAIL_PROVIDER, CHES_TOKEN_URL, CHES_API_URL, CHES_USERNAME, CHES_PASSWORD, MAIL_FROM } = config;

const sesClient = new SESClient({ region: process.env.AWS_REGION });

let chesTokenCache: { token: string; expiresAt: number } | null = null;

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
  if (!to || to.length === 0 || !subject || !body) {
    throw new Error('to, subject, and body are required');
  }

  if (!['ches', 'ses'].includes(EMAIL_PROVIDER)) {
    throw new Error(`Unsupported email provider: ${EMAIL_PROVIDER}`);
  }

  const from = MAIL_FROM;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 200 ms, 400 ms, 800 ms …
      const backoff = 2 ** (attempt - 1) * 200;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }

    try {
      if (EMAIL_PROVIDER === 'ches') {
        await sendEmailThroughChes({ from, to, subject, body, ...rest });
      } else {
        await sendEmailThroughSES({ from, to, subject, body });
      }
      return;
    } catch (error) {
      lastError = error;
      logger.warn(`Email send attempt ${attempt + 1}/${maxRetries} failed`, { error: String(error) });
    }
  }

  throw new Error(`Failed to send email after ${maxRetries} attempts. Last error: ${lastError}`);
};

const getChesToken = async () => {
  if (chesTokenCache && Date.now() < chesTokenCache.expiresAt) {
    return [chesTokenCache.token, null];
  }

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

    if (data.expires_in) {
      chesTokenCache = {
        token: access_token,
        expiresAt: Date.now() + data.expires_in * 1000 - 60000, // buffer of 1 minute
      };
    }

    return [access_token, null];
  } catch (err) {
    return [null, err];
  }
};

export const sendEmailThroughChes = async (email: EmailOptions) => {
  try {
    const { from, to, subject, body, ...rest } = email;
    const [accessToken, error] = await getChesToken();
    if (error) {
      throw new Error('unable to fetch ches token');
    }

    await axios.post(
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
  } catch (err) {
    console.error('Error sending email through ches', err);
    throw new Error('Failed to send email through ches');
  }
};

export const sendEmailThroughSES = async (email: EmailOptions) => {
  try {
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
  } catch (err) {
    console.error('Error sending email through aws ses', err);
    throw new Error('Failed to send email through aws ses');
  }
};
