const db = require('../db');
const { Markup } = require('telegraf');

/**
 * Hiển thị Menu lịch sử
 */
async function showHistoryMenu(ctx) {
  const text = `🕒 *LỊCH SỬ HOẠT ĐỘNG*\n\n` +
               `Vui lòng chọn loại lịch sử bạn muốn xem bên dưới:`;

  const buttons = [
    [
      Markup.button.callback('🛍️ Lịch sử mua hàng', 'history_purchases'),
      Markup.button.callback('💳 Lịch sử nạp tiền', 'history_deposits')
    ],
    [Markup.button.callback('⬅️ Quay lại Menu', 'menu_main')]
  ];

  const keyboard = Markup.inlineKeyboard(buttons);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } else {
    await ctx.replyWithMarkdown(text, keyboard);
  }
}

/**
 * Hiển thị lịch sử mua hàng
 */
async function showPurchaseHistory(ctx) {
  const tg_id = ctx.from.id;

  try {
    const history = await db.getPurchaseHistory(tg_id);

    if (!history || history.length === 0) {
      const text = `ℹ️ *Bạn chưa mua dịch vụ nào trên hệ thống.*`;
      const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Quay Lại', 'menu_history')]]);
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      return;
    }

    let text = `🛍️ *LỊCH SỬ MUA HÀNG CỦA BẠN (Gần đây nhất)*\n\n`;

    // Hiển thị tối đa 5-10 đơn hàng gần nhất để tránh tin nhắn quá dài
    const recentOrders = history.slice(0, 10);

    recentOrders.forEach((order, index) => {
      const date = new Date(order.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const categoryName = order.categories?.name || 'Sản phẩm đã bị xóa';
      const priceFormatted = Number(order.price).toLocaleString('vi-VN');
      const content = order.items?.content || '_(Đang chờ xử lý)_';

      text += `📍 *Đơn #${index + 1}:* ${categoryName}\n` +
              `⏰ Thời gian: \`${date}\`\n` +
              `💵 Giá tiền: *${priceFormatted}đ*\n` +
              `📄 Nội dung:\n` +
              `\`\`\`\n` +
              `${content}\n` +
              `\`\`\`\n` +
              `───────────────────\n`;
    });

    if (history.length > 10) {
      text += `_Bot chỉ hiển thị 10 giao dịch mua hàng gần nhất._\n`;
    }

    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Quay Lại', 'menu_history')]]);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});

  } catch (error) {
    console.error('Lỗi lấy lịch sử mua hàng:', error);
    await ctx.reply('⚠️ Có lỗi xảy ra khi tải lịch sử mua hàng.');
  }
}

/**
 * Hiển thị lịch sử nạp tiền
 */
async function showDepositHistory(ctx) {
  const tg_id = ctx.from.id;

  try {
    const history = await db.getDepositHistory(tg_id);

    if (!history || history.length === 0) {
      const text = `ℹ️ *Bạn chưa có giao dịch nạp tiền nào trên hệ thống.*`;
      const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Quay Lại', 'menu_history')]]);
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      return;
    }

    let text = `💳 *LỊCH SỬ NẠP TIỀN CỦA BẠN (Gần đây nhất)*\n\n`;

    const recentDeposits = history.slice(0, 10);

    recentDeposits.forEach((tx, index) => {
      const date = new Date(tx.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const amountFormatted = Number(tx.amount).toLocaleString('vi-VN');
      
      let statusIcon = '⏳';
      let statusText = 'Đang chờ';
      if (tx.status === 'success') {
        statusIcon = '✅';
        statusText = 'Thành công';
      } else if (tx.status === 'cancelled') {
        statusIcon = '❌';
        statusText = 'Đã hủy';
      } else if (tx.status === 'expired') {
        statusIcon = '⌛';
        statusText = 'Hết hạn';
      }

      text += `📍 *Đơn #${index + 1}:* Mã \`${tx.order_code}\`\n` +
              `⏰ Thời gian: \`${date}\`\n` +
              `💵 Số tiền: *${amountFormatted}đ*\n` +
              `🚦 Trạng thái: ${statusIcon} *${statusText}*\n` +
              `───────────────────\n`;
    });

    if (history.length > 10) {
      text += `_Bot chỉ hiển thị 10 giao dịch nạp tiền gần nhất._\n`;
    }

    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Quay Lại', 'menu_history')]]);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});

  } catch (error) {
    console.error('Lỗi lấy lịch sử nạp tiền:', error);
    await ctx.reply('⚠️ Có lỗi xảy ra khi tải lịch sử nạp tiền.');
  }
}

module.exports = {
  showHistoryMenu,
  showPurchaseHistory,
  showDepositHistory
};
