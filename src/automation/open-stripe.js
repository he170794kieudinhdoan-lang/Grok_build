#!/usr/bin/env node
require('dotenv').config();

const { createGiftStripeCheckout, openStripeCheckout, openStripeUrl } = require('./x-gift');

function parseArgs(argv) {
  const args = {
    recipientId: null,
    username: null,
    url: null,
    open: true,
    headless: false,
    fillBilling: true,
    submit: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--id' || arg === '-i') {
      args.recipientId = argv[i + 1];
      i += 1;
    } else if (arg === '--username' || arg === '-u') {
      args.username = argv[i + 1];
      i += 1;
    } else if (arg === '--url') {
      args.url = argv[i + 1];
      i += 1;
    } else if (arg === '--open' || arg === '-o') {
      args.open = true;
    } else if (arg === '--no-open') {
      args.open = false;
    } else if (arg === '--headless') {
      args.headless = true;
    } else if (arg === '--no-fill') {
      args.fillBilling = false;
    } else if (arg === '--no-submit') {
      args.submit = false;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node src/automation/open-stripe.js --id <user_id> --username <screen_name>
  node src/automation/open-stripe.js --url <stripe_checkout_url>

Options:
  --id, -i        Numeric user ID người nhận gift
  --username, -u  Username X (không có @)
  --url           Mở trực tiếp link Stripe có sẵn (bỏ qua gọi API X)
  --no-open       Chỉ in URL, không mở browser (mặc định: tự mở)
  --no-fill       Không scrape fakeit / không điền billing Stripe
  --no-submit     Không tự nhấn nút Pay sau khi fill
  --headless      Browser chạy ẩn
  --open, -o      Mở browser (bật sẵn, không cần gõ)

Env required (.env):
  X_AUTH_TOKEN
  X_CT0
  X_GIFT_PRODUCT_ID   (optional, default prod_QH6h8qsTyMQrnI)

Example:
  node src/automation/open-stripe.js -i 2074040352869359616 -u dngkhoa3006
  node src/automation/open-stripe.js -i 2074040352869359616 -u dngkhoa3006 --no-open
  node src/automation/open-stripe.js --url "https://checkout.stripe.com/c/pay/cs_live_..."
`);
}

async function waitForBrowserClose(browser) {
  console.log('[X Gift] Browser đang mở — đóng cửa sổ để kết thúc script.');
  await new Promise((resolve) => {
    browser.on('disconnected', resolve);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.url) {
    if (!args.open) {
      console.log(`checkout_url=${args.url}`);
      return;
    }

    console.log('[X Gift] Mở Stripe URL có sẵn...');
    const session = await openStripeUrl(args.url, {
      headless: args.headless,
      fillBilling: args.fillBilling,
      submit: args.submit,
    });
    console.log(`[X Gift] Stripe URL: ${session.checkoutUrl}`);
    await waitForBrowserClose(session.browser);
    return;
  }

  if (!args.recipientId || !args.username) {
    printHelp();
    process.exit(1);
  }

  if (args.open) {
    console.log(`[X Gift] Tạo checkout và mở Stripe cho @${args.username} (${args.recipientId})...`);
    const session = await openStripeCheckout({
      recipientId: args.recipientId,
      username: args.username,
      headless: args.headless,
      fillBilling: args.fillBilling,
      submit: args.submit,
    });

    console.log(`[X Gift] Stripe URL: ${session.checkoutUrl}`);
    await waitForBrowserClose(session.browser);
    return;
  }

  console.log(`[X Gift] Tạo Stripe checkout cho @${args.username} (${args.recipientId})...`);
  const result = await createGiftStripeCheckout({
    recipientId: args.recipientId,
    username: args.username,
  });

  console.log('[X Gift] Thành công.');
  console.log(`checkout_url=${result.checkoutUrl}`);
}

main().catch((error) => {
  console.error('[X Gift] Lỗi:', error.message);
  process.exit(1);
});