const express = require('express');
const cors = require('cors');
const payos = require('./payos');
const db = require('./db');
const config = require('./config');

// Express App setup
const app = express();
app.use(cors());
app.use(express.json());

// Import bot trễ để tránh circular dependencies
let botInstance = null;
function setBotInstance(bot) {
  botInstance = bot;
}

// Endpoint kiểm tra trạng thái server
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Endpoint nhận Webhook của PayOS
app.post('/payos-webhook', async (req, res) => {
  console.log('[Webhook] Nhận thông báo thanh toán từ PayOS:', JSON.stringify(req.body));

  try {
    // 1. Kiểm tra nếu là webhook test/confirm từ PayOS Dashboard
    // Khi cấu hình Webhook, PayOS có thể gửi dữ liệu test để xác minh
    if (req.body && (req.body.desc === 'confirm' || req.body.data?.description?.includes('Ma giao dich thu'))) {
      console.log('[Webhook] Nhận request xác thực hoặc giao dịch thử từ PayOS. Bỏ qua xử lý CSDL.');
      return res.json({ success: true, message: 'Confirmed/Test webhook successfully.' });
    }

    // 2. Xác minh chữ ký dữ liệu từ PayOS
    const verifiedData = payos.verifyPaymentWebhookData(req.body);
    console.log('[Webhook] Xác thực chữ ký thành công. Dữ liệu verified:', verifiedData);

    const { orderCode, amount, desc, description } = verifiedData;

    // 3. Tìm giao dịch trong database
    const transaction = await db.getTransaction(orderCode);
    if (!transaction) {
      console.warn(`[Webhook] Giao dịch với orderCode ${orderCode} không tồn tại trên hệ thống.`);
      return res.status(200).json({ success: false, message: 'Transaction not found' });
    }

    // Nếu giao dịch đã thành công trước đó (do webhook gửi trùng lặp)
    if (transaction.status === 'success') {
      console.log(`[Webhook] Giao dịch ${orderCode} đã được xử lý trước đó.`);
      return res.json({ success: true, message: 'Already processed' });
    }

    // 4. Cập nhật trạng thái giao dịch thành success
    await db.updateTransactionStatus(orderCode, 'success');

    // 5. Cộng số dư tài khoản cho người dùng
    const updatedUser = await db.updateUserBalance(transaction.tg_id, amount);
    console.log(`[Webhook] Đã cộng ${amount}đ cho user ${transaction.tg_id}. Số dư mới: ${updatedUser.balance}đ`);

    // 6. Gửi thông báo đến Telegram của người dùng
    if (botInstance) {
      try {
        const message = `🎉 *NẠP TIỀN THÀNH CÔNG!*\n\n` +
                        `🔹 Mã đơn hàng: \`${orderCode}\`\n` +
                        `💵 Số tiền: *+${Number(amount).toLocaleString('vi-VN')} đ*\n` +
                        `💰 Số dư hiện tại: *${Number(updatedUser.balance).toLocaleString('vi-VN')} đ*\n\n` +
                        `Cảm ơn bạn đã sử dụng dịch vụ!`;

        await botInstance.telegram.sendMessage(transaction.tg_id, message, { parse_mode: 'Markdown' });
        console.log(`[Webhook] Đã gửi thông báo Telegram cho user ${transaction.tg_id}`);
      } catch (botError) {
        console.error(`[Webhook] Lỗi khi gửi tin nhắn qua bot Telegram cho user ${transaction.tg_id}:`, botError);
      }
    } else {
      console.warn('[Webhook] BotInstance chưa được khởi tạo. Không thể gửi thông báo Telegram.');
    }

    return res.json({ success: true, message: 'Payment processed successfully' });

  } catch (error) {
    console.error('[Webhook] Xảy ra lỗi khi xử lý webhook:', error);
    // Vẫn trả về 200/400 tùy trường hợp, PayOS yêu cầu trả về HTTP Status phù hợp.
    // Nếu signature không hợp lệ, trả về 400 để báo lỗi dữ liệu giả mạo.
    if (error.message && error.message.includes('signature')) {
      return res.status(400).json({ success: false, message: 'Invalid signature signature verification failed' });
    }
    return res.status(200).json({ success: false, message: error.message });
  }
});

function startServer() {
  const PORT = config.PORT;

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`[Express] Webhook Server đang chạy trên port ${PORT}`);
      console.log(`[Express] Webhook URL dự kiến: ${config.WEBHOOK_URL || 'Chưa cấu hình WEBHOOK_URL'}/payos-webhook`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} đang được dùng — tắt process cũ hoặc đổi PORT trong .env`));
      } else {
        reject(error);
      }
    });
  });
}

module.exports = {
  startServer,
  setBotInstance,
  app
};
