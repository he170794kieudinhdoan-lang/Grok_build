const db = require('./db');
const { PRODUCT_LIST } = require('./products-config');
const { retry } = require('./utils/retry');

async function seedProductsOnce() {
  for (const product of PRODUCT_LIST) {
    const existing = await db.getCategoryByName(product.dbName);

    if (!existing) {
      await db.adminCreateCategory(product.dbName, product.description, product.price);
      console.log(`[Seed] Đã tạo danh mục: ${product.dbName} (${product.price}đ)`);
      continue;
    }

    if (Number(existing.price) !== product.price || existing.description !== product.description) {
      await db.adminUpdateCategory(existing.id, {
        description: product.description,
        price: product.price,
      });
      console.log(`[Seed] Đã cập nhật danh mục: ${product.dbName}`);
    }
  }
}

async function seedProducts() {
  console.log('[Seed] Đang kiểm tra danh mục dịch vụ...');
  console.log('[Seed] Nếu project Supabase vừa resume, có thể mất 2–5 phút...');

  await retry(seedProductsOnce, {
    attempts: 18,
    delayMs: 10000,
    label: 'Kết nối Supabase',
  });

  console.log('[Seed] Hoàn tất kiểm tra danh mục dịch vụ.');
}

module.exports = { seedProducts };