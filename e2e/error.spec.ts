import { test, expect } from '@playwright/test';
import { initURL } from './util';

let url = new URL(initURL);
const homeUrl = 'https://example.com';

// Forces error page with non-existent client id
test.beforeEach(() => {
  url = new URL(initURL);
  url.searchParams.set('client_id', 'dne');
});

test('Shows home url link when provided', async ({ page }) => {
  url.searchParams.set('client_id', 'dne');
  url.searchParams.set('client_home_url', homeUrl);

  await page.goto(url.toString());
  await expect(page.getByRole('heading')).toContainText("We couldn't sign you in");
  await expect(page.getByRole('link', { name: homeUrl })).toBeVisible();

  await page.goto(url.toString());
});

test('Excludes home URL when query param is not set', async ({ page }) => {
  await page.goto(url.toString());
  await expect(page.getByRole('heading')).toContainText("We couldn't sign you in");
  await expect(page.getByRole('link')).not.toBeVisible();
});

test('Excludes home URL if non-http(s) protocol', async ({ page }) => {
  const homeUrl = 'javascript:alert("Hi")';
  url.searchParams.set('client_home_url', homeUrl);

  await page.goto(url.toString());
  await expect(page.getByRole('heading')).toContainText("We couldn't sign you in");
  await expect(page.getByRole('link')).not.toBeVisible();
});
