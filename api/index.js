require('dotenv').config();

module.exports = (_req, res) => {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.WEBHOOK_URL || null;

  res.status(200).json({
    ok: true,
    service: 'Gift Premium Runner',
    account: process.env.ACCOUNT_LABEL || 'Account 2',
    note: 'Gift automation cần chạy npm start trên máy local/VPS (Playwright). Vercel chỉ nhận webhook Telegram.',
    endpoints: {
      health: '/api/health',
      telegramWebhook: baseUrl ? `${baseUrl}/api/telegram` : '/api/telegram',
      setupWebhook: baseUrl ? `${baseUrl}/api/setup-webhook` : '/api/setup-webhook',
    },
  });
};
