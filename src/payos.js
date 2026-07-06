const PayOS = require('@payos/node');
const config = require('./config');

if (!config.PAYOS_CLIENT_ID || !config.PAYOS_API_KEY || !config.PAYOS_CHECKSUM_KEY) {
  throw new Error('Thiếu cấu hình PayOS trong file .env');
}

const payos = new PayOS(
  config.PAYOS_CLIENT_ID,
  config.PAYOS_API_KEY,
  config.PAYOS_CHECKSUM_KEY
);

module.exports = payos;
