const { chromium } = require('playwright');
const { getXSessionFromEnv, buildGiftHeaders } = require('./x-session');
const { hasProxy, getPlaywrightProxy, fetchWithOptionalProxy } = require('./proxy');
const { fillStripeBillingFromFakeit } = require('./stripe-billing');

const GIFT_QUERY_ID = 'GqTVJ4S1526tLkxj69xIZw';
const GIFT_MUTATION_URL = `https://x.com/i/api/graphql/${GIFT_QUERY_ID}/useOneTimePurchaseGiftMutation`;

function buildGiftUrls(username) {
  const base = `https://x.com/${username}/gift-premium`;
  return {
    giftPage: base,
    cancelUrl: base,
    successUrl: `${base}/success`,
  };
}

function buildGiftPayload(recipientId, username, productId) {
  const urls = buildGiftUrls(username);

  return {
    variables: {
      cancel_url: urls.cancelUrl,
      external_product_id: productId,
      success_url: urls.successUrl,
      gift_recipient: String(recipientId),
    },
    queryId: GIFT_QUERY_ID,
  };
}

function extractCheckoutUrl(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const serialized = JSON.stringify(payload);
  const stripeMatch = serialized.match(/https?:\/\/[^"\\]*stripe\.com[^"\\]*/i);
  if (stripeMatch) return stripeMatch[0].replace(/\\u002F/g, '/');

  const queue = [payload];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string') {
        const lowerKey = key.toLowerCase();
        if (
          (lowerKey.includes('checkout') || lowerKey.includes('payment') || lowerKey.includes('url')) &&
          value.includes('stripe.com')
        ) {
          return value;
        }
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function formatGraphQLErrors(data) {
  return data?.errors?.map((e) => e.message).join('; ') || '';
}

function isNonRetryableGiftError(message = '') {
  const lower = message.toLowerCase();
  return (
    lower.includes('not eligible') ||
    lower.includes('ineligible') ||
    lower.includes('cannot receive') ||
    lower.includes('already has') ||
    lower.includes('premium')
  );
}

function assertNoGraphQLErrors(data) {
  if (data?.errors?.length) {
    const message = formatGraphQLErrors(data);
    const error = new Error(`X GraphQL error: ${message}`);
    error.nonRetryable = isNonRetryableGiftError(message);
    throw error;
  }
}

async function createGiftCheckoutViaFetch(recipientId, username) {
  const session = getXSessionFromEnv();
  const urls = buildGiftUrls(username);
  const body = buildGiftPayload(recipientId, username, session.productId);

  const response = await fetchWithOptionalProxy(GIFT_MUTATION_URL, {
    method: 'POST',
    headers: buildGiftHeaders(session, urls.giftPage),
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`X API trả về non-JSON (${response.status}): ${raw.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`X API HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }

  assertNoGraphQLErrors(data);

  const checkoutUrl = extractCheckoutUrl(data);
  if (!checkoutUrl) {
    throw new Error(`Không tìm thấy Stripe URL trong response: ${raw.slice(0, 500)}`);
  }

  return {
    checkoutUrl,
    recipientId: String(recipientId),
    username,
    rawResponse: data,
  };
}

async function createGiftCheckoutViaBrowser(recipientId, username) {
  const session = getXSessionFromEnv();
  const urls = buildGiftUrls(username);
  const body = buildGiftPayload(recipientId, username, session.productId);

  const proxy = getPlaywrightProxy();
  const browser = await chromium.launch({ headless: true, proxy });
  const context = await browser.newContext({
    locale: hasProxy() ? 'de-DE' : 'en-US',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  });

  try {
    await context.addCookies([
      { name: 'auth_token', value: session.authToken, domain: '.x.com', path: '/' },
      { name: 'ct0', value: session.ct0, domain: '.x.com', path: '/' },
      ...(session.twid
        ? [{ name: 'twid', value: session.twid, domain: '.x.com', path: '/' }]
        : []),
    ]);

    const page = await context.newPage();
    await page.goto(urls.giftPage, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const result = await page.evaluate(
      async ({ mutationUrl, payload, ct0 }) => {
        const response = await fetch(mutationUrl, {
          method: 'POST',
          headers: {
            accept: '*/*',
            'content-type': 'application/json',
            'x-csrf-token': ct0,
            'x-twitter-active-user': 'yes',
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-client-language': 'en',
          },
          body: JSON.stringify(payload),
          credentials: 'include',
        });

        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
      },
      { mutationUrl: GIFT_MUTATION_URL, payload: body, ct0: session.ct0 }
    );

    if (!result.ok) {
      throw new Error(`Browser fetch HTTP ${result.status}: ${result.text.slice(0, 300)}`);
    }

    let data;
    try {
      data = JSON.parse(result.text);
    } catch {
      throw new Error(`Browser fetch non-JSON: ${result.text.slice(0, 300)}`);
    }

    assertNoGraphQLErrors(data);

    const checkoutUrl = extractCheckoutUrl(data);
    if (!checkoutUrl) {
      throw new Error(`Không tìm thấy Stripe URL: ${result.text.slice(0, 500)}`);
    }

    return {
      checkoutUrl,
      recipientId: String(recipientId),
      username,
      rawResponse: data,
    };
  } finally {
    await browser.close();
  }
}

async function createGiftStripeCheckout({ recipientId, username }) {
  if (!recipientId) throw new Error('recipientId là bắt buộc');
  if (!username) throw new Error('username là bắt buộc (dùng cho cancel/success URL)');

  if (hasProxy()) {
    console.log('[X Gift] Dùng proxy — tạo checkout qua browser (IP EU)...');
    return createGiftCheckoutViaBrowser(recipientId, username);
  }

  try {
    return await createGiftCheckoutViaFetch(recipientId, username);
  } catch (fetchError) {
    if (fetchError.nonRetryable || isNonRetryableGiftError(fetchError.message)) {
      throw new Error(
        `User @${username} không đủ điều kiện nhận gift trên X (${fetchError.message.replace('X GraphQL error: ', '')})`
      );
    }

    console.warn('[X Gift] Fetch trực tiếp thất bại, thử qua browser context:', fetchError.message);
    return createGiftCheckoutViaBrowser(recipientId, username);
  }
}

async function launchStripeBrowser(checkoutUrl, { headless = false } = {}) {
  const proxy = getPlaywrightProxy();
  const browser = await chromium.launch({ headless, proxy });
  const context = await browser.newContext({
    locale: hasProxy() ? 'de-DE' : 'en-US',
    viewport: { width: 1440, height: 1200 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto(checkoutUrl, { waitUntil: 'load', timeout: 120000 });

  if (hasProxy()) {
    console.log('[X Gift] Stripe mở qua proxy EU — sẽ có thêm payment methods (SEPA, bank transfer...).');
  }

  return { browser, context, page, checkoutUrl };
}

async function openStripeUrl(checkoutUrl, { headless = false, fillBilling = true, fakeitUrl, submit = true } = {}) {
  if (!checkoutUrl?.includes('checkout.stripe.com')) {
    throw new Error('URL phải là Stripe checkout (checkout.stripe.com)');
  }

  const session = await launchStripeBrowser(checkoutUrl, { headless });

  if (fillBilling) {
    session.identity = await fillStripeBillingFromFakeit(session.page, session.context, fakeitUrl, {
      submit,
    });
  }

  return session;
}

async function openStripeCheckout({
  recipientId,
  username,
  headless = false,
  fillBilling = true,
  fakeitUrl,
  submit = true,
}) {
  const { checkoutUrl } = await createGiftStripeCheckout({ recipientId, username });
  const session = await launchStripeBrowser(checkoutUrl, { headless });

  if (fillBilling) {
    session.identity = await fillStripeBillingFromFakeit(session.page, session.context, fakeitUrl, {
      submit,
    });
  }

  return {
    checkoutUrl,
    recipientId: String(recipientId),
    username,
    ...session,
  };
}

module.exports = {
  GIFT_MUTATION_URL,
  buildGiftPayload,
  createGiftStripeCheckout,
  launchStripeBrowser,
  openStripeUrl,
  openStripeCheckout,
};