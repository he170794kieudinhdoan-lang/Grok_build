const { getXSessionFromEnv, buildGiftHeaders } = require('./x-session');
const { fetchWithOptionalProxy } = require('./proxy');

const USER_QUERY_ID = process.env.X_USER_QUERY_ID || 'sLVLhk0bGj3MVFEKTdax1w';

const USER_FEATURES = {
  hidden_profile_subscriptions_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

const userIdCache = new Map();

function cleanUsername(username) {
  return String(username || '')
    .trim()
    .replace(/^@/, '');
}

function extractRestId(payload) {
  const result = payload?.data?.user?.result;
  if (result?.rest_id) return String(result.rest_id);
  if (result?.id && /^\d+$/.test(String(result.id))) return String(result.id);

  const serialized = JSON.stringify(payload);
  const match = serialized.match(/"rest_id":"(\d+)"/);
  return match ? match[1] : null;
}

async function getUserIdByUsername(username) {
  const screenName = cleanUsername(username);
  if (!screenName) throw new Error('Username trống');

  if (userIdCache.has(screenName.toLowerCase())) {
    return userIdCache.get(screenName.toLowerCase());
  }

  const session = getXSessionFromEnv();
  const giftUrl = `https://x.com/${screenName}/gift-premium`;
  const variables = encodeURIComponent(
    JSON.stringify({ screen_name: screenName, withGrokTranslatedBio: false })
  );
  const features = encodeURIComponent(JSON.stringify(USER_FEATURES));
  const gqlUrl = `https://x.com/i/api/graphql/${USER_QUERY_ID}/UserByScreenName?variables=${variables}&features=${features}`;

  const response = await fetchWithOptionalProxy(gqlUrl, {
    headers: buildGiftHeaders(session, giftUrl),
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`UserByScreenName non-JSON (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`UserByScreenName HTTP ${response.status}: ${raw.slice(0, 200)}`);
  }

  if (data?.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join('; '));
  }

  const restId = extractRestId(data);
  if (!restId) {
    throw new Error(`Không tìm được user ID cho @${screenName} — user có tồn tại không?`);
  }

  userIdCache.set(screenName.toLowerCase(), restId);
  return restId;
}

module.exports = {
  cleanUsername,
  getUserIdByUsername,
};