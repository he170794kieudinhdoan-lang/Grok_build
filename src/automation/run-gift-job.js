const { getUserIdByUsername, cleanUsername } = require('./x-user');
const { createGiftStripeCheckout, launchStripeBrowser } = require('./x-gift');
const { fillStripeBillingFromFakeit } = require('./stripe-billing');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runGiftJob({ username, headless = true, submit = true, onLog }) {
  const screenName = cleanUsername(username);
  const log = (message) => {
    const line = `[${screenName}] ${message}`;
    console.log(`[GiftJob] ${line}`);
    onLog?.(message);
  };

  let browser;

  try {
    log('Lấy user ID...');
    const recipientId = await getUserIdByUsername(screenName);
    log(`User ID: ${recipientId}`);

    log('Tạo Stripe checkout...');
    const { checkoutUrl } = await createGiftStripeCheckout({
      recipientId,
      username: screenName,
    });
    log('Stripe URL đã tạo');

    log(headless ? 'Chạy headless...' : 'Mở browser...');
    const session = await launchStripeBrowser(checkoutUrl, { headless });
    browser = session.browser;

    log('Scrape fakeit + điền form...');
    const identity = await fillStripeBillingFromFakeit(session.page, session.context, null, {
      submit,
    });

    await delay(submit ? 4000 : 1000);
    const finalUrl = session.page.url();

    log(submit ? 'Đã submit Pay' : 'Đã fill form');
    return {
      success: true,
      username: screenName,
      recipientId,
      checkoutUrl,
      finalUrl,
      identity,
    };
  } catch (error) {
    log(`Lỗi: ${error.message}`);
    return {
      success: false,
      username: screenName,
      error: error.message,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { runGiftJob };