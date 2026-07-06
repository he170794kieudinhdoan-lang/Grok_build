require('dotenv').config();

module.exports = async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'Thiếu TELEGRAM_BOT_TOKEN' });
    }

    const webhookUrl =
      process.env.WEBHOOK_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/telegram` : null);

    if (!webhookUrl) {
      return res.status(400).json({ error: 'Không xác định được webhook URL' });
    }

    const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    return res.status(data.ok ? 200 : 400).json({
      webhookUrl,
      ...data,
    });
  } catch (error) {
    console.error('[Setup Webhook]', error);
    return res.status(500).json({ error: error.message });
  }
};
