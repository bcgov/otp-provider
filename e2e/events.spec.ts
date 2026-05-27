import { test, expect } from '@playwright/test';
import { cleanupOtps, cleanupEvents, findEvents, findActiveOtp, updateOtp } from './db';
import { changeOTP, fillOTP, initURL, clientId } from './util';

const OTP_RESENDS_ALLOWED_PER_DAY = Number(process.env.OTP_RESENDS_ALLOWED_PER_DAY ?? 4);
const OTP_ATTEMPTS_ALLOWED = Number(process.env.OTP_ATTEMPTS_ALLOWED ?? 5);

test.beforeEach(async () => {
  await cleanupOtps();
  await cleanupEvents();
});

test('Send Code Event', async ({ page }, testInfo) => {
  await page.goto(initURL);
  const email = `${testInfo.project.name}@b.com`;

  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');
  await expect(page.getByRole('heading')).toMatchAriaSnapshot(`- heading "Enter your verification code" [level=2]`);

  let requestCodeEvents = await findEvents(email, clientId, 'REQUEST_OTP');
  let resendCodeEvents = await findEvents(email, clientId, 'RESEND_OTP');

  expect(requestCodeEvents.length).toBe(1);
  expect(resendCodeEvents.length).toBe(0);

  // The variable OTP_RESENDS_ALLOWED_PER_DAY is actually sends per day, including the initial. Hence the minus 1 here
  // Check each new resend creates an event
  for (let i = 0; i < OTP_RESENDS_ALLOWED_PER_DAY; i++) {
    await expect(page.locator('#new-code-text')).toMatchAriaSnapshot(
      `
        - text: Can't find the code?
        - button "Send a new code"
        `,
      { timeout: 25000 },
    );
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await page.waitForURL('**/otp');
    resendCodeEvents = await findEvents(email, clientId, 'RESEND_OTP');
    expect(resendCodeEvents.length).toBe(i + 1);
  }

  // Check max_resend event is not trigerred yet. Attempt a new login and expect event to be logged.
  let maxResendEvents = await findEvents(email, clientId, 'MAX_RESENDS');
  expect(maxResendEvents.length).toBe(0);
  await page.goto(initURL);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('#signin-form')).toMatchAriaSnapshot(`
    - textbox "Email"
    - text: You have reached the maximum number of OTP requests for today. Please try again tomorrow.
    - button "Continue"
    `);

  maxResendEvents = await findEvents(email, clientId, 'MAX_RESENDS');
  expect(maxResendEvents.length).toBe(1);
});

test('Retry code event', async ({ page }, testInfo) => {
  await page.goto(initURL);
  const email = `${testInfo.project.name}@b.com`;

  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');

  const currentOtpRow = await findActiveOtp(`${testInfo.project.name}@b.com`);
  const wrongOTP = changeOTP(String(currentOtpRow.otp));

  // Verify at zero to start
  let invalidOtpEvents = await findEvents(email, clientId, 'INVALID_OTP');
  let maxAttemptsEvents = await findEvents(email, clientId, 'MAX_ATTEMPTS');

  expect(invalidOtpEvents.length).toBe(0);
  expect(maxAttemptsEvents.length).toBe(0);

  for (let i = 0; i <= OTP_ATTEMPTS_ALLOWED; i++) {
    await fillOTP(wrongOTP, false, page);

    if (i < OTP_ATTEMPTS_ALLOWED) {
      await expect(page.locator('#otp-error')).toContainText('Invalid code');
      invalidOtpEvents = await findEvents(email, clientId, 'INVALID_OTP');
      expect(invalidOtpEvents.length).toBe(i + 1);
    } else {
      await expect(page.locator('#otp-error')).toContainText("You've tried too many times");
      maxAttemptsEvents = await findEvents(email, clientId, 'MAX_ATTEMPTS');
      expect(maxAttemptsEvents.length).toBe(1);
    }
  }
});

test('Expired OTP Event', async ({ page }, testInfo) => {
  await page.goto(initURL);
  const email = `${testInfo.project.name}@b.com`;

  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');

  const currentOtpRow = await findActiveOtp(`${testInfo.project.name}@b.com`);

  // Set OTP timestamp to make it expired
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  await updateOtp(currentOtpRow.id, { createdAt: fiveMinutesAgo });

  // Verify at zero to start
  let expiredOtpEvents = await findEvents(email, clientId, 'EXPIRED_OTP');
  expect(expiredOtpEvents.length).toBe(0);

  // assert filling in otp creates event
  await fillOTP(currentOtpRow.otp, false, page);
  expiredOtpEvents = await findEvents(email, clientId, 'EXPIRED_OTP');
  expect(expiredOtpEvents.length).toBe(1);
});
