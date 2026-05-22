import request, { Agent } from 'supertest';
import { jest } from '@jest/globals';
import { generateCodeVerifierChallenge } from './helpers/utils';
import { cleanUpOtps, getOtpsByEmail } from './helpers/queries';

const userEmail = 'test-user-1@gov.bc.ca';

const clientId = 'pub-client';

let agent: Agent;

// Must be called before any dynamic import that transitively loads mailer.
// Static imports are hoisted above this call, so app must be loaded dynamically below.
const mockSendEmail = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
jest.unstable_mockModule('../mailer', () => ({
  sendEmail: mockSendEmail,
}));

const { default: app, initializeApp } = await import('../app');
// Import sequelize from the same dynamic-import chain so we close the correct pool.
const { default: sequelize } = await import('../modules/sequelize/config');

describe('validations', () => {
  let interactionPath = '';
  const { codeChallenge } = generateCodeVerifierChallenge();
  beforeAll(async () => {
    await initializeApp(app);
    agent = request.agent(app);
    await cleanUpOtps();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(() => {
    // Reset to success by default; individual tests override as needed.
    mockSendEmail.mockResolvedValue(true);
  });

  it('should rollback database transactions on error sending otp email', async () => {
    mockSendEmail.mockRejectedValue(new Error('Simulated email sending failure'));
    const authRes = await agent.get('/auth').query({
      client_id: clientId,
      scope: 'openid',
      response_type: 'code',
      redirect_uri: 'http://localhost:3000/cb',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    expect(authRes.status).toEqual(303);
    interactionPath = authRes.headers.location;
    let loginRes = await agent.post(`${interactionPath}/otp`).type('form').send({ email: userEmail });
    expect(loginRes.status).toEqual(500);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const otps = await getOtpsByEmail(userEmail);
    expect(otps.length).toEqual(0); // No OTP should be created due to transaction rollback
  });

  it('should send otp and save database transactions upon no error', async () => {
    const authRes = await agent.get('/auth').query({
      client_id: clientId,
      scope: 'openid',
      response_type: 'code',
      redirect_uri: 'http://localhost:3000/cb',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    expect(authRes.status).toEqual(303);
    interactionPath = authRes.headers.location;
    let loginRes = await agent.post(`${interactionPath}/otp`).type('form').send({ email: userEmail });
    expect(loginRes.status).toEqual(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const otps = await getOtpsByEmail(userEmail);
    expect(otps.length).toEqual(1); // No OTP should be created due to transaction rollback
  });
});
