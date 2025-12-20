import crypto from 'crypto';

const rbaSecret = process.env.RBA_SECRET;
const rbaUrl = process.env.RBA_URL;
const keyID = process.env.RBA_KEY_ID;

export const sendFailedAuthEvent = async (email: string, ip: string) => {
  const time = String(Math.floor(Date.now() / 1000));

  if (rbaSecret && rbaUrl && keyID) {
    const sig = crypto.createHmac('sha256', rbaSecret).update(time).digest('hex');

    const res = await fetch(`${rbaUrl}/event`, {
      method: 'POST',
      headers: [
        ['X-Key-ID', keyID],
        ['X-Timestamp', time],
        ['X-Signature', sig],
      ],
      body: JSON.stringify({
        event: 'login_failure',
        data: {
          ip: ip,
          account: email,
        },
      }),
    }).catch((err) => {
      console.log(err);
      throw new Error('bad request');
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return await res.json();
  } else {
    console.log('Skipping RBA: missing configuration');
  }
};
