import { test, expect } from '@playwright/test';
import { config } from '../src/config';
import { errors } from '../src/utils/shared';
import { changeOTP, fillOTP, initURL, clientId, redirectURI } from './util';
import { cleanupEvents, cleanupOtps, findActiveOtp, findEvents, updateOtp } from './db';

test.beforeEach(async () => {
  // Reset all OTPs between tests
  await cleanupEvents();
  await cleanupOtps();
});

test('OTP Validations', async ({ page }, testInfo) => {
  await page.goto(initURL);

  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(`${testInfo.project.name}@b.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');
  await expect(page.getByRole('heading')).toMatchAriaSnapshot(`- heading "Enter your verification code" [level=2]`);

  await page.getByRole('textbox', { name: 'Digit 1' }).fill('a');
  await expect(page.locator('#otp-error')).toHaveText(errors.OTP_TYPES);
  const currentOtpRow = await findActiveOtp(`${testInfo.project.name}@b.com`);
  const wrongOTP = changeOTP(String(currentOtpRow.otp));

  await fillOTP(wrongOTP, false, page);

  await expect(page.locator('#otp-error')).toMatchAriaSnapshot(
    `- text: Invalid code entered. Please try again or send a new code.`,
  );
});

test('OTP submits when all digits are filled regardless of order', async ({ page }, testInfo) => {
  await page.goto(initURL);

  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(`${testInfo.project.name}@b.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');
  await expect(page.getByRole('heading')).toMatchAriaSnapshot(`- heading "Enter your verification code" [level=2]`);

  const currentOtpRow = await findActiveOtp(`${testInfo.project.name}@b.com`);
  const currentOtp = currentOtpRow.otp;

  // Fill the first 4 digits
  for (let i = 0; i < 4; i++) {
    await page.getByRole('textbox', { name: `Digit ${i + 1}` }).fill(currentOtp[i]);
  }
  // Fill the 6th digit
  await page.getByRole('textbox', { name: 'Digit 6' }).fill(currentOtp[5]);

  // Fill the 5th digit.
  await page.getByRole('textbox', { name: 'Digit 5' }).fill(currentOtp[4]);

  // Submission should run and send to the redirect
  await page.waitForRequest((req) => {
    return req.url().startsWith(redirectURI);
  });
});

test('OTP Resend Code Countdown', async ({ page }, testInfo) => {
  await page.goto(initURL);

  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(`${testInfo.project.name}@b.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');
  await expect(page.getByRole('heading')).toMatchAriaSnapshot(`- heading "Enter your verification code" [level=2]`);

  // Resend code should have a cooldown counter since one was just sent
  await expect(page.locator('#wait-text')).toMatchAriaSnapshot(
    `- text: /Please wait \\d+ seconds before requesting a new code for this email address\\./`,
  );

  // Slow running case checking the send code button updates when the timer ends (60 seconds countdown)
  await expect(page.locator('#new-code-text')).toMatchAriaSnapshot(
    `
    - text: Can't find the code?
    - button "Send a new code"
    `,
    { timeout: 63000 },
  );
  // Resending code shows the countdown for the next interval
  await page.getByRole('button', { name: 'Send a new code' }).click();
  await page.waitForURL('**/otp');
  await expect(page.locator('#new-code-text')).toMatchAriaSnapshot(
    `- text: /Can't find the code\\? Please wait \\d+ seconds before requesting a new code for this email address\\./`,
  );
});

test('OTP Attempts Limit', async ({ page }, testInfo) => {
  await page.goto(initURL);

  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(`${testInfo.project.name}@b.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');
  await expect(page.getByRole('heading')).toMatchAriaSnapshot(`- heading "Enter your verification code" [level=2]`);

  const currentOtpRow = await findActiveOtp(`${testInfo.project.name}@b.com`);
  const wrongOTP = changeOTP(String(currentOtpRow.otp));

  for (let i = 0; i < Number(config.OTP_ATTEMPTS_ALLOWED); i++) {
    await fillOTP(wrongOTP, false, page);
    await expect(page.locator('#otp-error')).toMatchAriaSnapshot(
      `- text: Invalid code entered. Please try again or send a new code.`,
    );
  }

  await fillOTP(wrongOTP, false, page);
  await expect(page.locator('#otp-error')).toMatchAriaSnapshot(
    `- text: You've tried too many times. Please send a new code.`,
  );
  // Assert all inputs are disabled
  const inputs = await page.$$('input');
  for (const input of inputs) {
    const isDisabled = await input.isDisabled();
    expect(isDisabled).toBe(true);
  }
});

test('OTP Success', async ({ page }, testInfo) => {
  const email = `${testInfo.project.name}@b.com`;
  await page.goto(initURL);
  // Enter email and go to OTP page
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');
  await expect(page.getByRole('heading')).toMatchAriaSnapshot(`- heading "Enter your verification code" [level=2]`);

  let verifiedOTPEvents = await findEvents(email, clientId, 'OTP_VERIFIED');
  expect(verifiedOTPEvents.length).toBe(0);

  const currentOtpRow = await findActiveOtp(email);

  await fillOTP(currentOtpRow.otp, true, page);
  verifiedOTPEvents = await findEvents(email, clientId, 'OTP_VERIFIED');
  expect(verifiedOTPEvents.length).toBe(1);
});

test('OTP Expired', async ({ page }, testInfo) => {
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

  // assert filling in otp creates event
  await fillOTP(currentOtpRow.otp, false, page);
  await expect(page.locator('body')).toMatchAriaSnapshot(
    `- paragraph: The verification code sent to ${email} has expired after five minutes.`,
  );
});
