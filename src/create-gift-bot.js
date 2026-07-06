const { Telegraf } = require('telegraf');
const giftHandler = require('./handlers/gift');

function createGiftBot(token) {
  if (!token) {
    throw new Error('Thiếu TELEGRAM_BOT_TOKEN');
  }

  const bot = new Telegraf(token);

  bot.command('start', giftHandler.showMainMenu);
  bot.command('help', giftHandler.showHelp);
  bot.command('status', giftHandler.showBatches);

  bot.command('batch', async (ctx) => {
    const batchId = ctx.message.text.replace(/^\/batch\s*/, '').trim();
    if (!batchId) {
      return ctx.reply('Dùng: /batch <batch-id>');
    }
    return giftHandler.showBatchDetail(ctx, batchId);
  });

  bot.action('gift_menu', giftHandler.showMainMenu);
  bot.action('gift_batches', giftHandler.showBatches);
  bot.action('gift_help', giftHandler.showHelp);

  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    return giftHandler.handleUsernameList(ctx, text);
  });

  bot.catch((err, ctx) => {
    console.error(`[GiftBot] Lỗi user ${ctx.from?.id}:`, err);
    ctx.reply('⚠️ Lỗi hệ thống. Thử lại sau.').catch(() => {});
  });

  return bot;
}

module.exports = { createGiftBot };
