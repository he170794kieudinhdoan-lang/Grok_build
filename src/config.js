require('dotenv').config();

const config = {
  PORT: process.env.PORT || 3000,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_ID: process.env.TELEGRAM_ADMIN_ID ? parseInt(process.env.TELEGRAM_ADMIN_ID, 10) : null,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  PAYOS_CLIENT_ID: process.env.PAYOS_CLIENT_ID,
  PAYOS_API_KEY: process.env.PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY: process.env.PAYOS_CHECKSUM_KEY,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  X_AUTH_TOKEN: process.env.X_AUTH_TOKEN,
  X_CT0: process.env.X_CT0,
  X_TWID: process.env.X_TWID,
  X_GUEST_ID: process.env.X_GUEST_ID,
  X_GIFT_PRODUCT_ID: process.env.X_GIFT_PRODUCT_ID || 'prod_QH6h8qsTyMQrnI',
  X_PROXY_URL: process.env.X_PROXY_URL || process.env.PROXY_URL || '',
  GIFT_CONCURRENCY: parseInt(process.env.GIFT_CONCURRENCY || '1', 10),
  GIFT_UI_PORT: parseInt(process.env.GIFT_UI_PORT || '3001', 10),
};

// Kiểm tra các biến môi trường bắt buộc
const requiredFields = [
  'TELEGRAM_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'PAYOS_CLIENT_ID',
  'PAYOS_API_KEY',
  'PAYOS_CHECKSUM_KEY'
];

const missing = requiredFields.filter(field => !config[field] || config[field].includes('YOUR_'));
if (missing.length > 0) {
  console.warn(`[WARNING] Thiếu các biến môi trường quan trọng: ${missing.join(', ')}`);
  console.warn(`Hãy cập nhật file .env để bot hoạt động chính xác.`);
}

module.exports = config;
