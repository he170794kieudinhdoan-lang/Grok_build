const DEFAULT_FAKEIT_URL =
  process.env.FAKEIT_URL || 'https://fakeit.receivefreesms.co.uk/c/de/';

async function waitForFieldText(page, selector, timeout = 30000) {
  await page.waitForSelector(selector, { timeout });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim() || '';
      return text.length > 0 && !text.toLowerCase().includes('loading');
    },
    selector,
    { timeout }
  );
}

async function scrapeFakeIdentity(page, url = DEFAULT_FAKEIT_URL) {
  console.log(`[Fakeit] Đang load: ${url}`);
  await page.bringToFront().catch(() => {});
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  await waitForFieldText(page, '#nameLoading');
  await waitForFieldText(page, '#addressLoading');
  await waitForFieldText(page, '#cityLoading');
  await waitForFieldText(page, '#postcodeLoading');

  const identity = await page.evaluate(() => ({
    name: document.querySelector('#nameLoading')?.textContent?.trim() || '',
    address: document.querySelector('#addressLoading')?.textContent?.trim() || '',
    city: document.querySelector('#cityLoading')?.textContent?.trim() || '',
    postcode: document.querySelector('#postcodeLoading')?.textContent?.trim() || '',
    email: document.querySelector('#emailLoading')?.textContent?.trim() || '',
    phone: document.querySelector('#phoneLoading')?.textContent?.trim() || '',
    country: 'DE',
  }));

  if (!identity.name || !identity.address || !identity.city || !identity.postcode) {
    throw new Error('[Fakeit] Không lấy đủ name/address/city/postcode');
  }

  console.log(`[Fakeit] Name: ${identity.name}`);
  console.log(`[Fakeit] Address: ${identity.address}`);
  console.log(`[Fakeit] City: ${identity.city}`);
  console.log(`[Fakeit] Postcode: ${identity.postcode}`);

  return identity;
}

module.exports = {
  DEFAULT_FAKEIT_URL,
  scrapeFakeIdentity,
};