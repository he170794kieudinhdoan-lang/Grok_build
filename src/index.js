const config = require('./config');
const bot = require('./bot');
const server = require('./server');
const { startGiftServer } = require('./automation/dashboard-server');
const { seedProducts } = require('./seed');
const { formatError } = require('./utils/retry');

async function main() {
  console.log('🚀 Đang khởi động Telegram Premium Bot...');

  // 1. Kiểm tra các cấu hình tối thiểu để bắt đầu
  if (!config.TELEGRAM_BOT_TOKEN || config.TELEGRAM_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.error('❌ LỖI: Chưa cấu hình TELEGRAM_BOT_TOKEN trong file .env');
    process.exit(1);
  }

  try {
    // 2. Seed 3 danh mục dịch vụ cố định
    await seedProducts();

    // 3. Chia sẻ bot instance cho express server dùng để gửi tin nhắn thông báo
    server.setBotInstance(bot);

    // 4. Khởi động Express Webhook Server (port 3000)
    await server.startServer();

    // 4b. Khởi động Gift UI riêng (port 3001)
    await startGiftServer(config.GIFT_UI_PORT);

    // 5. Khởi động Telegram Bot
    console.log('[Telegram Bot] Đang khởi chạy bot...');
    await bot.launch();
    
    const botInfo = await bot.telegram.getMe();
    console.log(`[Telegram Bot] Đã chạy thành công bot: @${botInfo.username}`);

    // 6. Cài đặt các tín hiệu dừng dịch vụ an toàn (graceful stop)
    process.once('SIGINT', () => {
      console.log('🛑 Nhận tín hiệu SIGINT. Đang dừng bot...');
      bot.stop('SIGINT');
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      console.log('🛑 Nhận tín hiệu SIGTERM. Đang dừng bot...');
      bot.stop('SIGTERM');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Gặp lỗi nghiêm trọng khi chạy hệ thống:', formatError(error));
    console.error('💡 Gợi ý: Vào Supabase Dashboard → mở project → đợi trạng thái Active → chạy lại npm run dev');
    process.exit(1);
  }
}

main();
