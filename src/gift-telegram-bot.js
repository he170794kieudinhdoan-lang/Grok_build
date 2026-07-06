const { loadEnv, configurePlaywright } = require('./app-root');
const { createGiftBot } = require('./create-gift-bot');

loadEnv();
configurePlaywright();

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = process.env.TELEGRAM_ADMIN_ID;

if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN') {
  console.error('❌ Thiếu TELEGRAM_BOT_TOKEN trong .env');
  console.error('   Tạo bot tại @BotFather → /newbot → copy token vào .env');
  process.exit(1);
}

if (!adminId) {
  console.warn('⚠️  Chưa có TELEGRAM_ADMIN_ID — không ai dùng được bot.');
  console.warn('   Lấy ID tại @userinfobot → thêm vào .env');
}

if (!process.env.X_AUTH_TOKEN || !process.env.X_CT0) {
  console.error('❌ Thiếu X_AUTH_TOKEN hoặc X_CT0 trong .env');
  process.exit(1);
}

const bot = createGiftBot(token);
const label = process.env.ACCOUNT_LABEL || 'Account 2';

async function main() {
  console.log(`🚀 Gift Premium Telegram Bot — ${label}`);
  console.log(`   Admin ID: ${adminId || '(chưa set)'}`);
  console.log(`   Concurrency: ${process.env.GIFT_CONCURRENCY || 1}`);

  await bot.launch();
  const me = await bot.telegram.getMe();
  console.log(`✅ Bot đang chạy: @${me.username}`);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((error) => {
  console.error('❌ Không khởi động được bot:', error.message);
  process.exit(1);
});
