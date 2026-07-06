const X_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

function getXSessionFromEnv() {
  const authToken = process.env.X_AUTH_TOKEN;
  const ct0 = process.env.X_CT0;

  if (!authToken || !ct0) {
    throw new Error('Thiếu X_AUTH_TOKEN hoặc X_CT0 trong .env');
  }

  return {
    authToken,
    ct0,
    twid: process.env.X_TWID || '',
    guestId: process.env.X_GUEST_ID || '',
    productId: process.env.X_GIFT_PRODUCT_ID || 'prod_QH6h8qsTyMQrnI',
  };
}

function buildCookieHeader(session) {
  const parts = [`auth_token=${session.authToken}`, `ct0=${session.ct0}`];

  if (session.twid) parts.push(`twid=${session.twid}`);
  if (session.guestId) parts.push(`guest_id=${session.guestId}`);

  parts.push('lang=en');
  return parts.join('; ');
}

function buildGiftHeaders(session, referer) {
  return {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    authorization: `Bearer ${X_BEARER_TOKEN}`,
    'content-type': 'application/json',
    cookie: buildCookieHeader(session),
    origin: 'https://x.com',
    referer,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'x-csrf-token': session.ct0,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en',
  };
}

module.exports = {
  X_BEARER_TOKEN,
  getXSessionFromEnv,
  buildCookieHeader,
  buildGiftHeaders,
};