const db = require('../db');
const payos = require('../payos');
const config = require('../config');
const { Markup } = require('telegraf');

// Lưu trạng thái nhập tiền thủ công của người dùng
const userStates = new Map();

/**
 * Hiển thị menu nạp tiền
 */
async function showDepositMenu(ctx) {
  const text = `💳 *NẠP TIỀN TỰ ĐỘNG QUA NGÂN HÀNG (PayOS)*\n\n` +
               `Hệ thống sử dụng cổng thanh toán PayOS để quét mã VietQR tự động cộng tiền.\n` +
               `Vui lòng chọn mệnh giá cần nạp hoặc nhập số tiền khác:`;

  const buttons = [
    [
      Markup.button.callback('💵 10,000 đ', 'deposit_amount_10000'),
      Markup.button.callback('💵 20,000 đ', 'deposit_amount_20000')
    ],
    [
      Markup.button.callback('💵 50,000 đ', 'deposit_amount_50000'),
      Markup.button.callback('💵 60,000 đ', 'deposit_amount_60000')
    ],
    [
      Markup.button.callback('💵 100,000 đ', 'deposit_amount_100000')
    ],
    [
      Markup.button.callback('💵 200,000 đ', 'deposit_amount_200000'),
      Markup.button.callback('💵 500,000 đ', 'deposit_amount_500000')
    ],
    [
      Markup.button.callback('✍️ Nhập số tiền khác', 'deposit_amount_custom')
    ],
    [
      Markup.button.callback('⬅️ Quay lại Menu', 'menu_main')
    ]
  ];

  const keyboard = Markup.inlineKeyboard(buttons);

  if (ctx.updateType === 'callback_query') {
    if (ctx.callbackQuery.message.photo) {
      await ctx.deleteMessage().catch(() => {});
      await ctx.replyWithMarkdown(text, keyboard);
    } else {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    }
    await ctx.answerCbQuery().catch(() => {});
  } else {
    await ctx.replyWithMarkdown(text, keyboard);
  }
}

/**
 * Đăng ký trạng thái đợi nhập tiền thủ công
 */
function setWaitingForCustomAmount(tg_id) {
  userStates.set(tg_id, { state: 'WAITING_DEPOSIT_AMOUNT' });
}

/**
 * Kiểm tra xem user có đang đợi nhập tiền không
 */
function isWaitingForCustomAmount(tg_id) {
  return userStates.get(tg_id)?.state === 'WAITING_DEPOSIT_AMOUNT';
}

/**
 * Xóa trạng thái của user
 */
function clearUserState(tg_id) {
  userStates.delete(tg_id);
}

/**
 * Tạo link thanh toán PayOS và gửi cho user
 */
async function generatePaymentLink(ctx, amount) {
  const tg_id = ctx.from.id;
  
  if (amount < 10000) {
    await ctx.reply('⚠️ Số tiền nạp tối thiểu là 10,000 đ.');
    return showDepositMenu(ctx);
  }
  if (amount > 10000000) {
    await ctx.reply('⚠️ Số tiền nạp tối đa một lần là 10,000,000 đ.');
    return showDepositMenu(ctx);
  }

  try {
    // Thông báo cho người dùng biết hệ thống đang xử lý
    let loadingMessage;
    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText('⏳ *Đang tạo cổng thanh toán, vui lòng chờ...*', { parse_mode: 'Markdown' });
      await ctx.answerCbQuery().catch(() => {});
    } else {
      loadingMessage = await ctx.replyWithMarkdown('⏳ *Đang tạo cổng thanh toán, vui lòng chờ...*');
    }

    // Tạo mã đơn hàng ngẫu nhiên duy nhất (số nguyên an toàn JS, dưới 2^53 - 1)
    const orderCode = Math.floor(Date.now() + Math.random() * 1000);
    
    // Tạo link redirect
    // Thường link redirect là link bot Telegram, ví dụ: https://t.me/your_bot
    const botUrl = ctx.botInfo ? `https://t.me/${ctx.botInfo.username}` : `https://t.me`;

    // Chuẩn bị payload tạo link thanh toán của PayOS
    // Description chỉ cho phép chữ cái không dấu, số, khoảng trắng và dấu gạch ngang
    const description = `Nap tien bot ${orderCode}`.substring(0, 25);
    const paymentData = {
      orderCode,
      amount,
      description,
      cancelUrl: botUrl,
      returnUrl: botUrl
    };

    // Gọi API PayOS tạo link thanh toán
    const payosResponse = await payos.createPaymentLink(paymentData);
    
    // Lưu thông tin giao dịch pending vào Supabase
    await db.createTransaction(orderCode, tg_id, amount);

    const paymentText = `💳 *THÔNG TIN NẠP TIỀN* (Mã: \`${orderCode}\`)\n\n` +
                        `💵 Số tiền: *${amount.toLocaleString('vi-VN')} đ*\n` +
                        `📝 Nội dung chuyển khoản: \`${description}\`\n\n` +
                        `👉 Bạn có thể click nút dưới đây để quét mã QR VietQR hoặc thanh toán trực tiếp qua ngân hàng.`;

    const buttons = [
      [Markup.button.url('📲 Thanh Toán Ngay (QR)', payosResponse.checkoutUrl)],
      [
        Markup.button.callback('🔄 Kiểm tra thanh toán', `deposit_check_${orderCode}`),
        Markup.button.callback('❌ Hủy đơn', `deposit_cancel_${orderCode}`)
      ]
    ];
    const keyboard = Markup.inlineKeyboard(buttons);

    // Tạo link ảnh QR code từ VietQR string của PayOS
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payosResponse.qrCode)}`;

    // Xóa tin nhắn cũ (tin nhắn menu hoặc tin nhắn loading)
    if (ctx.updateType === 'callback_query') {
      await ctx.deleteMessage().catch(() => {});
    } else {
      if (loadingMessage) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id).catch(() => {});
      }
      await ctx.deleteMessage().catch(() => {}); // Xóa tin nhắn nhập tay của user cho sạch chat
    }

    // Gửi QR Code kèm thông tin
    await ctx.replyWithPhoto(
      qrImageUrl,
      {
        caption: paymentText,
        parse_mode: 'Markdown',
        ...keyboard
      }
    );

  } catch (error) {
    console.error('Lỗi khi tạo giao dịch PayOS:', error);
    const errorText = '⚠️ Có lỗi xảy ra trong quá trình kết nối với cổng thanh toán PayOS. Vui lòng liên hệ Admin hoặc thử lại sau.';
    
    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(errorText, Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'menu_main')]]));
    } else {
      await ctx.reply(errorText);
    }
  }
}

/**
 * Kiểm tra trạng thái thanh toán từ PayOS thủ công
 */
async function checkTransactionStatus(ctx, orderCode) {
  const tg_id = ctx.from.id;

  try {
    const transaction = await db.getTransaction(orderCode);
    if (!transaction) {
      await ctx.answerCbQuery('⚠️ Giao dịch không tồn tại.', { show_alert: true });
      return;
    }

    if (transaction.status === 'success') {
      await ctx.answerCbQuery('🎉 Giao dịch này đã nạp thành công!', { show_alert: true });
      return showDepositMenu(ctx);
    }

    // Lấy thông tin từ PayOS trực tiếp
    const payosInfo = await payos.getPaymentLinkInformation(orderCode);
    console.log(`[Manual Check] Thông tin từ PayOS cho đơn ${orderCode}:`, payosInfo.status);

    if (payosInfo.status === 'PAID') {
      // Cập nhật database và cộng tiền
      await db.updateTransactionStatus(orderCode, 'success');
      const updatedUser = await db.updateUserBalance(tg_id, transaction.amount);
      
      const successMsg = `🎉 *NẠP TIỀN THÀNH CÔNG!*\n\n` +
                         `🔹 Mã đơn hàng: \`${orderCode}\`\n` +
                         `💵 Số tiền: *+${Number(transaction.amount).toLocaleString('vi-VN')} đ*\n` +
                         `💰 Số dư hiện tại: *${Number(updatedUser.balance).toLocaleString('vi-VN')} đ*`;

      const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu chính', 'menu_main')]]);
      
      await ctx.deleteMessage().catch(() => {});
      await ctx.replyWithMarkdown(successMsg, keyboard);
      await ctx.answerCbQuery('Thanh toán thành công!', { show_alert: false }).catch(() => {});
    } else if (payosInfo.status === 'CANCELLED') {
      await db.updateTransactionStatus(orderCode, 'cancelled');
      await ctx.deleteMessage().catch(() => {});
      await ctx.replyWithMarkdown(`❌ Đơn nạp tiền \`${orderCode}\` đã bị hủy bỏ.`, Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'menu_main')]]));
      await ctx.answerCbQuery('Đơn hàng đã bị hủy.', { show_alert: true }).catch(() => {});
    } else if (payosInfo.status === 'EXPIRED') {
      await db.updateTransactionStatus(orderCode, 'expired');
      await ctx.deleteMessage().catch(() => {});
      await ctx.replyWithMarkdown(`⌛ Đơn nạp tiền \`${orderCode}\` đã hết hạn thanh toán.`, Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'menu_main')]]));
      await ctx.answerCbQuery('Đơn hàng đã hết hạn.', { show_alert: true }).catch(() => {});
    } else {
      // Đang chờ thanh toán (PENDING)
      await ctx.answerCbQuery('⏳ Hệ thống chưa ghi nhận được chuyển khoản. Vui lòng thanh toán và đợi ít phút.', { show_alert: true });
    }

  } catch (error) {
    console.error('Lỗi khi kiểm tra giao dịch thủ công:', error);
    await ctx.answerCbQuery('⚠️ Lỗi kiểm tra giao dịch. Vui lòng thử lại sau.', { show_alert: true });
  }
}

/**
 * Hủy giao dịch thanh toán
 */
async function cancelTransaction(ctx, orderCode) {
  try {
    const transaction = await db.getTransaction(orderCode);
    if (!transaction) {
      await ctx.answerCbQuery('⚠️ Giao dịch không tồn tại.', { show_alert: true });
      return;
    }

    if (transaction.status !== 'pending') {
      await ctx.answerCbQuery('⚠️ Giao dịch này đã được xử lý hoặc hủy trước đó.', { show_alert: true });
      return showDepositMenu(ctx);
    }

    // Cập nhật trạng thái database
    await db.updateTransactionStatus(orderCode, 'cancelled');
    
    // Gọi PayOS để hủy link thanh toán (nếu PayOS hỗ trợ)
    try {
      await payos.cancelPaymentLink(orderCode);
    } catch (e) {
      // Bỏ qua nếu link đã hết hạn hoặc không tồn tại trên PayOS
    }

    await ctx.deleteMessage().catch(() => {});
    await ctx.replyWithMarkdown(`❌ Đã hủy đơn nạp tiền \`${orderCode}\`.`, Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'menu_main')]]));
    await ctx.answerCbQuery('Đơn nạp tiền đã hủy thành công.', { show_alert: false }).catch(() => {});

  } catch (error) {
    console.error('Lỗi khi hủy giao dịch:', error);
    await ctx.answerCbQuery('⚠️ Không thể hủy đơn. Vui lòng thử lại sau.', { show_alert: true });
  }
}

module.exports = {
  showDepositMenu,
  setWaitingForCustomAmount,
  isWaitingForCustomAmount,
  clearUserState,
  generatePaymentLink,
  checkTransactionStatus,
  cancelTransaction
};
