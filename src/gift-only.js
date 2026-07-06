const { loadEnv, configurePlaywright } = require('./app-root');

loadEnv();
configurePlaywright();

const { startGiftServer } = require('./automation/dashboard-server');

async function main() {
  const port = process.env.GIFT_UI_PORT || 3003;
  const label = process.env.ACCOUNT_LABEL || 'Account 2';
  console.log(`🚀 Gift Premium Runner — ${label}`);
  await startGiftServer(port);
}

main().catch((error) => {
  console.error('❌ Lỗi:', error.message);
  process.exit(1);
});