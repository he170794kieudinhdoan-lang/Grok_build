function getProxyUrl() {
  return process.env.X_PROXY_URL || process.env.PROXY_URL || '';
}

function hasProxy() {
  return Boolean(getProxyUrl());
}

function parsePlaywrightProxy(proxyUrl) {
  const url = new URL(proxyUrl);
  const config = { server: `${url.protocol}//${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}` };

  if (url.username) config.username = decodeURIComponent(url.username);
  if (url.password) config.password = decodeURIComponent(url.password);

  return config;
}

function getPlaywrightProxy() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;
  return parsePlaywrightProxy(proxyUrl);
}

async function fetchWithOptionalProxy(url, options = {}) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return fetch(url, options);

  const { ProxyAgent, fetch: undiciFetch } = require('undici');
  const agent = new ProxyAgent(proxyUrl);
  return undiciFetch(url, { ...options, dispatcher: agent });
}

module.exports = {
  getProxyUrl,
  hasProxy,
  getPlaywrightProxy,
  fetchWithOptionalProxy,
};