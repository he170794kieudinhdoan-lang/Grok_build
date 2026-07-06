const db = require('../db');
const { Markup } = require('telegraf');
const { PRODUCT_LIST, getProductBySlug, formatPrice } = require('../products-config');
const bookingHandler = require('./booking');

/**
 * Hiển thị menu 3 dịch vụ
 */
async function showCategories(ctx) {
  try {
    let text =
      `✨ *DỊCH VỤ CỦA EM*\n\n` +
      `Chọn gói bạn muốn mua bên dưới:\n\n`;

    PRODUCT_LIST.forEach((product, index) => {
      text += `${index + 1}. *${product.name}* — *${formatPrice(product.price)} đ*\n`;
      text += `   _${product.description}_\n\n`;
    });

    text += `💡 *Hướng dẫn:* Nạp tiền trước, sau đó chọn gói để thanh toán.`;

    const buttons = PRODUCT_LIST.map((product) => [
      Markup.button.callback(
        `${product.name} — ${formatPrice(product.price)}đ`,
        `buy_select_${product.slug}`
      ),
    ]);

    buttons.push([Markup.button.callback('⬅️ Quay lại Menu', 'menu_main')]);
    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      await ctx.answerCbQuery().catch(() => {});
    } else {
      await ctx.replyWithMarkdown(text, keyboard);
    }
  } catch (error) {
    console.error('Lỗi khi tải danh sách dịch vụ:', error);
    await ctx.reply('⚠️ Có lỗi xảy ra. Vui lòng thử lại.');
  }
}

/**
 * Xem chi tiết dịch vụ
 */
async function showCategoryDetail(ctx, productSlug) {
  try {
    const product = getProductBySlug(productSlug);
    if (!product) {
      await ctx.answerCbQuery('⚠️ Dịch vụ không tồn tại.', { show_alert: true });
      return showCategories(ctx);
    }

    const category = await db.getCategoryByName(product.dbName);
    if (!category) {
      await ctx.answerCbQuery('⚠️ Dịch vụ chưa được thiết lập. Liên hệ admin.', { show_alert: true });
      return showCategories(ctx);
    }

    let stockInfo = '';
    if (product.type === 'digital') {
      const stock = await db.getAvailableItemsCount(category.id);
      stockInfo = `📦 *Còn hàng:* ${stock > 0 ? `*${stock}* link` : '🔴 *Hết hàng*'}\n`;
    } else {
      stockInfo = `📍 *Điều kiện:* Chỉ áp dụng khi bạn ở *Hà Nội*\n`;
    }

    const text =
      `📦 *CHI TIẾT DỊCH VỤ*\n\n` +
      `📛 *Gói:* ${product.name}\n` +
      `💵 *Giá:* *${formatPrice(product.price)} đ*\n` +
      stockInfo +
      `📝 *Mô tả:* _${product.description}_\n\n` +
      `Bạn có chắc muốn thanh toán gói này?`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Thanh Toán Ngay', `buy_confirm_${productSlug}`),
        Markup.button.callback('⬅️ Quay Lại', 'menu_products'),
      ],
    ]);

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } catch (error) {
    console.error('Lỗi chi tiết dịch vụ:', error);
    await ctx.reply('⚠️ Có lỗi xảy ra khi xem chi tiết dịch vụ.');
  }
}

/**
 * Xác nhận thanh toán
 */
async function confirmPurchase(ctx, productSlug) {
  const tg_id = ctx.from.id;

  try {
    const product = getProductBySlug(productSlug);
    if (!product) {
      await ctx.answerCbQuery('⚠️ Dịch vụ không tồn tại.', { show_alert: true });
      return;
    }

    const category = await db.getCategoryByName(product.dbName);
    if (!category) throw new Error('Dịch vụ chưa được thiết lập trên hệ thống.');

    if (product.type === 'booking') {
      const result = await db.purchaseBooking(tg_id, category.id);
      await ctx.answerCbQuery('Thanh toán thành công!', { show_alert: false }).catch(() => {});
      return bookingHandler.askHanoiConfirmation(ctx, result.orderId);
    }

    const result = await db.purchaseItem(tg_id, category.id);
    const newUser = await db.getUser(tg_id);

    const successMessage =
      `🎉 *THANH TOÁN THÀNH CÔNG!*\n\n` +
      `📦 *Gói:* \`${result.categoryName}\`\n` +
      `💵 *Giá:* \`${formatPrice(result.price)} đ\`\n` +
      `💰 *Số dư còn lại:* \`${formatPrice(newUser.balance)} đ\`\n\n` +
      `🔗 *NỘI DUNG CỦA BẠN:*\n` +
      `\`\`\`\n${result.itemContent}\n\`\`\`\n` +
      `_(Bấm vào ô trên để copy link nhanh)_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🛍️ Mua thêm', 'menu_products'),
        Markup.button.callback('🏠 Menu chính', 'menu_main'),
      ],
    ]);

    await ctx.editMessageText(successMessage, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery('Thanh toán thành công!', { show_alert: false }).catch(() => {});
  } catch (error) {
    console.error('Lỗi khi thanh toán:', error.message);

    let errorText = `❌ *THANH TOÁN THẤT BẠI*\n\n⚠️ Lý do: *${error.message}*`;
    const buttons = [];

    if (error.message.includes('Số dư tài khoản không đủ')) {
      buttons.push([Markup.button.callback('💳 Nạp Tiền Ngay', 'menu_deposit')]);
    }
    if (error.message.includes('hết hàng')) {
      buttons.push([Markup.button.callback('📩 Liên hệ Admin', 'menu_main')]);
    }

    buttons.push([
      Markup.button.callback('🛍️ Chọn gói khác', 'menu_products'),
      Markup.button.callback('🏠 Về Menu', 'menu_main'),
    ]);

    await ctx.editMessageText(errorText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    });
    await ctx.answerCbQuery('Lỗi giao dịch!', { show_alert: true }).catch(() => {});
  }
}

module.exports = {
  showCategories,
  showCategoryDetail,
  confirmPurchase,
};