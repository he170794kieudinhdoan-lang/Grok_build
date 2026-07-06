const db = require('../db');
const config = require('../config');
const { Markup } = require('telegraf');

/**
 * Hiển thị Menu chính
 */
async function showMainMenu(ctx) {
  const tg_id = ctx.from.id;
  const username = ctx.from.username;
  const first_name = ctx.from.first_name;

  try {
    const user = await db.getOrCreateUser(tg_id, username, first_name);
    const balanceFormatted = Number(user.balance).toLocaleString('vi-VN');
    const isAdmin = config.TELEGRAM_ADMIN_ID && tg_id === config.TELEGRAM_ADMIN_ID;

    const welcomeText =
      `👋 *Xin chào ${first_name || 'anh'}!*\n\n` +
      `💕 Chào mừng đến với bot của em~\n` +
      `💰 Số dư: *${balanceFormatted} đ*\n\n` +
      `📌 *Bảng giá:*\n` +
      `• 📸 Album Ảnh — *50.000đ*\n` +
      `• 📸🎬 Album Ảnh + Video — *60.000đ*\n` +
      `• 💬 Book lịch trò chuyện (Hà Nội) — *20.000đ*\n\n` +
      `Chọn dịch vụ bên dưới nhé 💋`;

    const buttons = [
      [Markup.button.callback('✨ Chọn Dịch Vụ', 'menu_products')],
      [
        Markup.button.callback('💳 Nạp Tiền', 'menu_deposit'),
        Markup.button.callback('🕒 Lịch Sử', 'menu_history'),
      ],
      [Markup.button.callback('👤 Tài Khoản', 'menu_profile')],
    ];

    if (isAdmin || user.role === 'admin') {
      buttons.push([Markup.button.callback('⚙️ Quản Trị', 'menu_admin')]);
    }

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.updateType === 'callback_query') {
      if (ctx.callbackQuery.message.photo) {
        await ctx.deleteMessage().catch(() => {});
        await ctx.replyWithMarkdown(welcomeText, keyboard);
      } else {
        await ctx.editMessageText(welcomeText, { parse_mode: 'Markdown', ...keyboard });
      }
      await ctx.answerCbQuery().catch(() => {});
    } else {
      await ctx.replyWithMarkdown(welcomeText, keyboard);
    }
  } catch (error) {
    console.error('Lỗi trong start handler:', error);
    await ctx.reply('⚠️ Có lỗi xảy ra khi kết nối cơ sở dữ liệu. Vui lòng thử lại sau.');
  }
}

module.exports = {
  showMainMenu,
};