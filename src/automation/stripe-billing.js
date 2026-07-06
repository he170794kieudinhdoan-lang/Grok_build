const { scrapeFakeIdentity } = require('./scrape-fakeit');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForStripeReady(stripePage) {
  console.log('[Stripe] Chờ trang checkout load...');
  await stripePage.waitForLoadState('load', { timeout: 120000 });
  await stripePage
    .waitForLoadState('networkidle', { timeout: 20000 })
    .catch(() => console.warn('[Stripe] networkidle timeout — tiếp tục'));

  await stripePage
    .locator('[data-testid="customer_balance-accordion-item"], [data-testid="card-accordion-item"]')
    .first()
    .waitFor({ state: 'visible', timeout: 120000 });
}

async function jsClick(stripePage, selector) {
  const clicked = await stripePage.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    if (typeof el.click === 'function') el.click();
    return true;
  }, selector);
  return clicked;
}

async function selectBankTransfer(stripePage) {
  console.log('[Stripe] Chọn Bank transfer...');

  await stripePage.evaluate(() => {
    const payment = document.querySelector('[data-testid="customer_balance-accordion-item"]');
    payment?.scrollIntoView({ block: 'center' });
    window.scrollBy(0, 300);
  });
  await delay(400);

  const bankItem = stripePage.locator('[data-testid="customer_balance-accordion-item"]');
  await bankItem.waitFor({ state: 'attached', timeout: 120000 });

  const isSelected = await bankItem.evaluate((el) =>
    el.classList.contains('PaymentMethodFormAccordionItem--selected')
  );

  if (!isSelected) {
    await jsClick(stripePage, '#payment-method-accordion-item-title-customer_balance');
    await delay(300);
    await jsClick(stripePage, '#payment-method-label-customer_balance');
    await delay(300);
    await jsClick(stripePage, '[data-testid="customer_balance-accordion-item-button"]');
    await delay(800);

    const stillNotSelected = await bankItem.evaluate(
      (el) => !el.classList.contains('PaymentMethodFormAccordionItem--selected')
    );
    if (stillNotSelected) {
      await bankItem.click({ force: true, position: { x: 20, y: 20 } }).catch(() => {});
      await delay(500);
    }
  }

  await stripePage.locator('#billingName').waitFor({ state: 'attached', timeout: 60000 });
  await delay(500);
}

function setNativeValueScript() {
  return ({ selector, value }) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: `Không tìm thấy ${selector}` };

    el.focus();
    el.click();

    const prototype =
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor?.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    return { ok: true, value: el.value };
  };
}

async function fillStripeInput(stripePage, selector, value, label) {
  if (!value) throw new Error(`[Stripe] Thiếu giá trị cho ${label}`);

  const input = stripePage.locator(selector);
  await input.waitFor({ state: 'visible', timeout: 60000 });
  await input.scrollIntoViewIfNeeded();

  let result = await stripePage.evaluate(setNativeValueScript(), { selector, value });

  if (!result.ok || result.value !== value) {
    await input.click({ force: true });
    await delay(100);
    await stripePage.keyboard.press('Control+A').catch(() => {});
    await stripePage.keyboard.press('Backspace').catch(() => {});
    await input.pressSequentially(value, { delay: 30 });
    await input.blur();
    await delay(200);
    result = { value: await input.inputValue() };
  }

  if (!result.value) {
    throw new Error(`[Stripe] Không điền được ${label} (selector: ${selector})`);
  }

  console.log(`[Stripe] ${label}: "${result.value}"`);
  return result.value;
}

async function selectBillingCountry(stripePage, countryCode = 'DE') {
  const result = await stripePage.evaluate(setNativeValueScript(), {
    selector: '#billingCountry',
    value: countryCode,
  });

  if (!result.ok || result.value !== countryCode) {
    await stripePage.locator('#billingCountry').selectOption(countryCode);
  }

  await delay(300);
  const value = await stripePage.locator('#billingCountry').inputValue();
  console.log(`[Stripe] billingCountry: "${value}"`);
  return value;
}

async function dismissAddressAutocomplete(stripePage) {
  await stripePage.keyboard.press('Escape').catch(() => {});
  await delay(200);
}

async function verifyBillingFilled(stripePage) {
  const values = await stripePage.evaluate(() => ({
    name: document.querySelector('#billingName')?.value || '',
    address: document.querySelector('#billingAddressLine1')?.value || '',
    city: document.querySelector('#billingLocality')?.value || '',
    postcode: document.querySelector('#billingPostalCode')?.value || '',
    country: document.querySelector('#billingCountry')?.value || '',
  }));

  const empty = Object.entries(values).filter(([, v]) => !v);
  if (empty.length) {
    throw new Error(`[Stripe] Field còn trống: ${empty.map(([k]) => k).join(', ')}`);
  }

  return values;
}

async function clickSubmitPayment(stripePage) {
  console.log('[Stripe] Nhấn nút Pay...');

  const payButton = stripePage.locator('[data-testid="hosted-payment-submit-button"]');
  await payButton.waitFor({ state: 'visible', timeout: 60000 });
  await payButton.scrollIntoViewIfNeeded();

  // Chờ Stripe validate form — nút bỏ class incomplete
  await stripePage
    .waitForFunction(() => {
      const btn = document.querySelector('[data-testid="hosted-payment-submit-button"]');
      return btn && !btn.classList.contains('SubmitButton--incomplete');
    }, { timeout: 15000 })
    .catch(() => console.warn('[Stripe] Nút Pay vẫn incomplete — vẫn thử click'));

  await delay(500);
  await payButton.click({ force: true });

  console.log('[Stripe] Đã nhấn Pay — chờ xử lý bank transfer...');
  await delay(2000);
}

async function fillStripeBillingFields(stripePage, identity, { skipWait = false, submit = false } = {}) {
  const { name, address, city, postcode, country = 'DE' } = identity;

  if (!skipWait) {
    await waitForStripeReady(stripePage);
  }

  await selectBankTransfer(stripePage);

  await fillStripeInput(stripePage, '#billingName', name, 'billingName');
  await selectBillingCountry(stripePage, country);
  await fillStripeInput(stripePage, '#billingAddressLine1', address, 'billingAddressLine1');
  await dismissAddressAutocomplete(stripePage);
  await fillStripeInput(stripePage, '#billingLocality', city, 'billingLocality');
  await fillStripeInput(stripePage, '#billingPostalCode', postcode, 'billingPostalCode');

  const filled = await verifyBillingFilled(stripePage);
  console.log('[Stripe] Hoàn tất điền billing form:', filled);

  if (submit) {
    await clickSubmitPayment(stripePage);
  }

  return filled;
}

async function fillStripeBillingFromFakeit(stripePage, context, fakeitUrl, { submit = true } = {}) {
  const url = fakeitUrl || process.env.FAKEIT_URL || 'https://fakeit.receivefreesms.co.uk/c/de/';

  console.log(`[Fakeit] Mở tab mới: ${url}`);
  const fakeitPage = await context.newPage();
  await fakeitPage.bringToFront();

  try {
    // Scrape fakeit + chờ Stripe load song song
    const [identity] = await Promise.all([
      scrapeFakeIdentity(fakeitPage, url),
      waitForStripeReady(stripePage),
    ]);

    console.log('[Fakeit] Scrape xong — quay lại Stripe điền form...');
    await delay(1500);

    await stripePage.bringToFront();
    await delay(500);

    await fillStripeBillingFields(
      stripePage,
      { ...identity, country: 'DE' },
      { skipWait: true, submit }
    );

    console.log('[Fakeit] Tab fakeit vẫn mở — đóng browser để tắt cả 2 tab.');
    return identity;
  } catch (error) {
    await stripePage
      .screenshot({ path: 'stripe-fill-error.png', fullPage: true })
      .catch(() => {});
    console.error('[Stripe] Lỗi fill — đã lưu screenshot: stripe-fill-error.png');
    throw error;
  }
}

module.exports = {
  waitForStripeReady,
  selectBankTransfer,
  clickSubmitPayment,
  fillStripeBillingFields,
  fillStripeBillingFromFakeit,
};