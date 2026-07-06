require('dotenv').config();

const { createGiftBot } = require('../src/create-gift-bot');

let bot;

function getBot() {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('Thiếu TELEGRAM_BOT_TOKEN trên Vercel Environment Variables');
    }
    bot = createGiftBot(token);
  }
  return bot;
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        message: 'Telegram webhook endpoint. POST updates từ Telegram vào đây.',
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    await getBot().handleUpdate(req.body);
    return res.status(200).end();
  } catch (error) {
    console.error('[Vercel Telegram]', error);
    return res.status(500).json({ error: error.message });
  }
};
