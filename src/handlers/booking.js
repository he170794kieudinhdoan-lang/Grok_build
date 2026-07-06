const db = require('../db');
const config = require('../config');
const { Markup } = require('telegraf');
const { formatPrice } = require('../products-config');

const bookingStates = new Map();

function setBookingState(tg_id, state) {
  bookingStates.set(tg_id, state);
}

function getBookingState(tg_id) {
  return bookingStates.get(tg_id);
}

function clearBookingState(tg_id) {
  bookingStates.delete(tg_id);
}

function isInBookingFlow(tg_id) {
  return !!bookingStates.get(tg_id);
}

async function notifyAdmin(ctx, message) {
  if (!config.TELEGRAM_ADMIN_ID) return;
  try {
    await ctx.telegram.sendMessage(config.TELEGRAM_ADMIN_ID, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Booking] Lỗi gửi thông báo admin:', error.message);
  }
}

async function askHanoiConfirmation(ctx, orderId) {
  const tg_id = ctx.from.id;
  setBookingState(tg_id, { state: 'CONFIRM_HANOI', orderId });

  const text =
    `✅ *ĐÃ THANH TOÁN PHÍ BOOK LỊCH!*\n\n` +
    `💵 Phí: *${formatPrice(20000)} đ*\n` +
    `📍 Mã đơn: \`${orderId}\`\n\n` +
    `Dịch vụ book lịch chỉ áp dụng khi bạn *đang ở Hà Nội*.\n` +
    `Bạn có đang ở Hà Nội không?`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Có, tôi ở Hà Nội', `booking_hanoi_yes_${orderId}`),
      Markup.button.callback('❌ Không', `booking_hanoi_no_${orderId}`),
    ],
    [Markup.button.callback('🏠 Về Menu', 'menu_main')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } else {
    await ctx.replyWithMarkdown(text, keyboard);
  }
}

async function handleHanoiNo(ctx, orderId) {
  clearBookingState(ctx.from.id);

  const text =
    `ℹ️ *Dịch vụ book lịch chỉ dành cho khách ở Hà Nội.*\n\n` +
    `Nếu bạn cần hỗ trợ hoặc hoàn tiền, vui lòng liên hệ admin qua bot.\n` +
    `Mã đơn: \`${orderId}\``;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'menu_main')]]),
  });
  await ctx.answerCbQuery().catch(() => {});

  await notifyAdmin(
    ctx,
    `⚠️ *Đơn book lịch — khách KHÔNG ở HN*\n\n` +
      `👤 User: ${ctx.from.first_name || 'N/A'} (@${ctx.from.username || 'không có'})\n` +
      `🆔 ID: \`${ctx.from.id}\`\n` +
      `📍 Mã đơn: \`${orderId}\``
  );
}

async function handleHanoiYes(ctx, orderId) {
  const tg_id = ctx.from.id;
  setBookingState(tg_id, { state: 'WAITING_BOOKING_INFO', orderId });

  const text =
    `📅 *NHẬP THÔNG TIN BOOK LỊCH*\n\n` +
    `Vui lòng gửi *một tin nhắn* gồm:\n` +
    `• Ngày & giờ mong muốn\n` +
    `• Số điện thoại / Telegram liên hệ\n` +
    `• Ghi chú thêm (nếu có)\n\n` +
    `*Ví dụ:*\n` +
    `_Ngày 5/7 lúc 20h, SĐT 0912345678, gặp tại Hoàn Kiếm_`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('❌ Hủy', 'menu_main')]]),
  });
  await ctx.answerCbQuery().catch(() => {});
}

async function handleBookingInfo(ctx, text) {
  const tg_id = ctx.from.id;
  const state = getBookingState(tg_id);

  if (!state || state.state !== 'WAITING_BOOKING_INFO') return false;

  if (text.length < 10) {
    await ctx.reply('⚠️ Thông tin quá ngắn. Vui lòng gửi đầy đủ ngày giờ và cách liên hệ.');
    return true;
  }

  try {
    const user = await db.getUser(tg_id);
    const bookingInfo =
      `[BOOK LỊCH HÀ NỘI]\n` +
      `Khách: ${user?.first_name || 'N/A'} (@${user?.username || 'không có'})\n` +
      `TG ID: ${tg_id}\n` +
      `Thông tin: ${text}`;

    await db.updateBookingInfo(state.orderId, tg_id, bookingInfo);
    clearBookingState(tg_id);

    await ctx.replyWithMarkdown(
      `🎉 *GỬI YÊU CẦU BOOK LỊCH THÀNH CÔNG!*\n\n` +
        `Em sẽ liên hệ bạn sớm nhất để xác nhận lịch.\n` +
        `Mã đơn: \`${state.orderId}\``,
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'menu_main')]])
    );

    await notifyAdmin(
      ctx,
      `📅 *ĐƠN BOOK LỊCH MỚI*\n\n` +
        `👤 ${user?.first_name || 'N/A'} (@${user?.username || 'không có'})\n` +
        `🆔 ID: \`${tg_id}\`\n` +
        `📍 Mã đơn: \`${state.orderId}\`\n\n` +
        `📝 *Thông tin:*\n${text}`
    );
  } catch (error) {
    console.error('[Booking] Lỗi lưu thông tin:', error);
    clearBookingState(tg_id);
    await ctx.reply('⚠️ Có lỗi khi lưu thông tin book lịch. Vui lòng liên hệ admin.');
  }

  return true;
}

module.exports = {
  setBookingState,
  getBookingState,
  clearBookingState,
  isInBookingFlow,
  askHanoiConfirmation,
  handleHanoiNo,
  handleHanoiYes,
  handleBookingInfo,
  notifyAdmin,
};