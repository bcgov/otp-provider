import * as client from 'openid-client';

const rbaClientSecret = process.env.RBA_CLIENT_SECRET;
const rbaAuthUrl = process.env.RBA_AUTH_URL;
const rbaBaseUrl = process.env.RBA_BASE_URL;
const rbaClientId = process.env.RBA_CLIENT_ID;

const config: client.Configuration = await client.discovery(
  new URL(rbaAuthUrl ?? ''),
  rbaClientId ?? '',
  rbaClientSecret ?? '',
);

let tokenSet: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
let tokenRequest: Promise<string | null> | null;

export const fetchRBAToken = async () => {
  // Request a new token if expiring within 5 seconds
  if (tokenSet && (tokenSet.expiresIn() ?? 0) > 5) {
    return tokenSet.access_token;
  }

  tokenRequest ||= client
    .clientCredentialsGrant(config)
    .then((response) => {
      tokenSet = response;
      return tokenSet.access_token;
    })
    .catch((err) => {
      console.error(`Error fetching RBA access token: ${err}`);
      return null;
    })
    .finally(() => {
      tokenRequest = null;
    });

  return tokenRequest;
};

export const sendFailedAuthEvent = async (email: string, ip: string) => {
  if (rbaClientSecret && rbaAuthUrl && rbaClientId && rbaBaseUrl) {
    const token = await fetchRBAToken();

    const res = await fetch(`${rbaBaseUrl}/event`, {
      method: 'POST',
      headers: [['Authorization', `Bearer ${token}`]],
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
