const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const db = require('./db');

// Import các Handlers
const startHandler = require('./handlers/start');
const productsHandler = require('./handlers/products');
const depositHandler = require('./handlers/deposit');
const historyHandler = require('./handlers/history');
const adminHandler = require('./handlers/admin');
const bookingHandler = require('./handlers/booking');

if (!config.TELEGRAM_BOT_TOKEN) {
  throw new Error('Thiếu TELEGRAM_BOT_TOKEN trong file .env');
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Middleware tự động đăng ký/cập nhật thông tin người dùng vào CSDL khi họ chat
bot.use(async (ctx, next) => {
  if (ctx.from) {
    try {
      await db.getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    } catch (e) {
      console.error('[Middleware] Lỗi đăng ký user:', e.message);
    }
  }
  return next();
});

// Lệnh /start
bot.command('start', startHandler.showMainMenu);

// Action chuyển đến Menu chính
bot.action('menu_main', startHandler.showMainMenu);

// Action chuyển đến Danh sách sản phẩm
bot.action('menu_products', productsHandler.showCategories);

// Action Xem chi tiết danh mục
bot.action(/^buy_select_(.+)$/, (ctx) => {
  const categoryId = ctx.match[1];
  return productsHandler.showCategoryDetail(ctx, categoryId);
});

// Action Xác nhận mua sản phẩm
bot.action(/^buy_confirm_(.+)$/, (ctx) => {
  const categoryId = ctx.match[1];
  return productsHandler.confirmPurchase(ctx, categoryId);
});

// Action Nạp tiền
bot.action('menu_deposit', depositHandler.showDepositMenu);

// Action xử lý mệnh giá nạp tiền
bot.action(/^deposit_amount_(.+)$/, async (ctx) => {
  const amountStr = ctx.match[1];
  const tg_id = ctx.from.id;

  if (amountStr === 'custom') {
    depositHandler.setWaitingForCustomAmount(tg_id);
    await ctx.editMessageText(
      '✍️ *Nhập số tiền cần nạp:*\n\n' +
      'Vui lòng gõ số tiền bạn muốn nạp gửi vào đây (Tối thiểu 10,000 đ, tối đa 10,000,000 đ).\n' +
      '_Ví dụ: gửi tin nhắn là "50000" hoặc "150000"_',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Hủy bỏ', 'menu_deposit')]])
      }
    );
    return ctx.answerCbQuery().catch(() => {});
  }

  const amount = parseInt(amountStr, 10);
  if (!isNaN(amount)) {
    return depositHandler.generatePaymentLink(ctx, amount);
  }
});

// Action kiểm tra thanh toán thủ công
bot.action(/^deposit_check_(.+)$/, (ctx) => {
  const orderCode = parseInt(ctx.match[1], 10);
  return depositHandler.checkTransactionStatus(ctx, orderCode);
});

// Action hủy đơn nạp tiền
bot.action(/^deposit_cancel_(.+)$/, (ctx) => {
  const orderCode = parseInt(ctx.match[1], 10);
  return depositHandler.cancelTransaction(ctx, orderCode);
});

// Action hiển thị trang cá nhân/thông tin tài khoản
bot.action('menu_profile', async (ctx) => {
  const tg_id = ctx.from.id;
  try {
    const user = await db.getUser(tg_id);
    if (!user) return ctx.answerCbQuery('Không tìm thấy thông tin.');

    const priceFormatted = Number(user.balance).toLocaleString('vi-VN');
    const isAdmin = config.TELEGRAM_ADMIN_ID && tg_id === config.TELEGRAM_ADMIN_ID;

    const text = `👤 *THÔNG TIN TÀI KHOẢN NGƯỜI DÙNG*\n\n` +
                 `🆔 ID Telegram: \`${user.tg_id}\`\n` +
                 `👤 Tên hiển thị: *${user.first_name || 'Không có'}*\n` +
                 `🏷️ Username: *${user.username ? '@' + user.username : 'Không có'}*\n` +
                 `💰 Số dư khả dụng: *${priceFormatted} đ*\n` +
                 `🔑 Quyền hạn: *${user.role === 'admin' || isAdmin ? 'Admin' : 'Thành viên'}*\n` +
                 `📅 Ngày tham gia: \`${new Date(user.created_at).toLocaleDateString('vi-VN')}\``;

    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Quay lại Menu', 'menu_main')]]);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } catch (error) {
    console.error('Lỗi trang cá nhân:', error);
    await ctx.reply('⚠️ Không thể tải thông tin tài khoản.');
  }
});

// Action Lịch sử
bot.action('menu_history', historyHandler.showHistoryMenu);
bot.action('history_purchases', historyHandler.showPurchaseHistory);
bot.action('history_deposits', historyHandler.showDepositHistory);

// Action Book lịch
bot.action(/^booking_hanoi_yes_(.+)$/, (ctx) => {
  const orderId = ctx.match[1];
  return bookingHandler.handleHanoiYes(ctx, orderId);
});
bot.action(/^booking_hanoi_no_(.+)$/, (ctx) => {
  const orderId = ctx.match[1];
  return bookingHandler.handleHanoiNo(ctx, orderId);
});

// Action Admin Panel
bot.action('menu_admin', adminHandler.showAdminPanel);
bot.action('admin_categories', adminHandler.showAdminCategories);
bot.action('admin_import_select', adminHandler.showImportSelect);
bot.action('admin_stock_view', adminHandler.showStockView);
bot.action('admin_bookings', adminHandler.showBookings);
bot.action(/^admin_delcat_(.+)$/, (ctx) => {
  const categoryId = ctx.match[1];
  return adminHandler.deleteCategory(ctx, categoryId);
});

// Admin khởi tạo thêm danh mục mới
bot.action('admin_create_cat_init', async (ctx) => {
  const tg_id = ctx.from.id;
  if (!(await adminHandler.isAdmin(tg_id))) return;

  adminHandler.setAdminState(tg_id, { state: 'WAITING_ADMIN_CAT_QUICK' });
  await ctx.editMessageText(
    '📝 *TẠO NHANH DANH MỤC MỚI*\n\n' +
    'Vui lòng gửi tin nhắn chứa thông tin danh mục theo cấu trúc phân cách bởi dấu gạch đứng `|`:\n\n' +
    '`Tên Danh Mục | Giá Tiền | Mô Tả Sản Phẩm`\n\n' +
    '*Ví dụ:* `CapCut VIP | 50000 | Tài khoản Premium 1 tháng.`\n' +
    '_(Lưu ý: Giá tiền phải là số nguyên dương)_',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Hủy bỏ', 'admin_categories')]])
    }
  );
});

// Admin chọn danh mục để import tài khoản
bot.action(/^admin_import_to_(.+)$/, async (ctx) => {
  const tg_id = ctx.from.id;
  const categoryId = ctx.match[1];
  if (!(await adminHandler.isAdmin(tg_id))) return;

  const category = await db.getCategory(categoryId);
  if (!category) return ctx.answerCbQuery('⚠️ Danh mục không tồn tại.');

  adminHandler.setAdminState(tg_id, { state: 'WAITING_ADMIN_IMPORT', category_id: categoryId });
  await ctx.editMessageText(
    `➕ *THÊM LINK ALBUM: ${category.name}*\n\n` +
    `Gửi danh sách link album (mỗi dòng = 1 link cho 1 khách).\n` +
    `⚠️ *Định dạng:* Mỗi link nằm trên một dòng riêng.\n\n` +
    `*Ví dụ:*\n` +
    `\`https://drive.google.com/album-1\`\n` +
    `\`https://t.me/+invite_link_2\``,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Hủy bỏ', 'admin_import_select')]])
    }
  );
});

// Xử lý tất cả các tin nhắn văn bản (quản lý trạng thái cuộc trò chuyện - State Machine)
bot.on('text', async (ctx) => {
  const tg_id = ctx.from.id;
  const text = ctx.message.text.trim();

  // 1. Kiểm tra trạng thái book lịch
  if (bookingHandler.isInBookingFlow(tg_id)) {
    const handled = await bookingHandler.handleBookingInfo(ctx, text);
    if (handled) return;
  }

  // 2. Kiểm tra trạng thái nạp tiền custom
  if (depositHandler.isWaitingForCustomAmount(tg_id)) {
    const amount = parseInt(text, 10);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('⚠️ Số tiền nhập vào không hợp lệ. Vui lòng gửi lại số tiền cần nạp bằng định dạng số (ví dụ: 20000):');
      return;
    }
    
    // Clear trạng thái và tạo link
    depositHandler.clearUserState(tg_id);
    return depositHandler.generatePaymentLink(ctx, amount);
  }

  // 3. Kiểm tra trạng thái Admin
  const adminState = adminHandler.getAdminState(tg_id);
  if (adminState) {
    // Chỉ admin mới được đi tiếp vào đây
    if (!(await adminHandler.isAdmin(tg_id))) {
      adminHandler.clearAdminState(tg_id);
      return;
    }

    // State A: Tạo nhanh danh mục bằng 1 tin nhắn
    if (adminState.state === 'WAITING_ADMIN_CAT_QUICK') {
      const parts = text.split('|').map(p => p.trim());
      if (parts.length < 2) {
        return ctx.reply('⚠️ Sai định dạng. Vui lòng gửi tin nhắn đúng mẫu:\nTên Danh Mục | Giá Tiền | Mô Tả\n\nVí dụ: CapCut VIP | 50000 | Tài khoản VIP 1 tháng');
      }

      const name = parts[0];
      const price = parseInt(parts[1], 10);
      const desc = parts[2] || 'Không có mô tả';

      if (name.length < 2) {
        return ctx.reply('⚠️ Tên danh mục quá ngắn. Vui lòng nhập lại:');
      }
      if (isNaN(price) || price < 0) {
        return ctx.reply('⚠️ Giá tiền không hợp lệ. Giá phải là một số nguyên dương (ví dụ: 50000). Vui lòng nhập lại:');
      }

      try {
        await db.adminCreateCategory(name, desc, price);
        adminHandler.clearAdminState(tg_id);
        
        await ctx.replyWithMarkdown(
          `✅ *Tạo danh mục sản phẩm thành công!*\n\n` +
          `📛 Danh mục: *${name}*\n` +
          `💵 Giá tiền: *${price.toLocaleString('vi-VN')} đ*\n` +
          `📝 Mô tả: _${desc}_`,
          Markup.inlineKeyboard([[Markup.button.callback('📁 Quản lý Danh mục', 'admin_categories')]])
        );
      } catch (error) {
        console.error('Lỗi tạo danh mục admin:', error);
        adminHandler.clearAdminState(tg_id);
        await ctx.reply('⚠️ Lỗi hệ thống khi lưu danh mục. Vui lòng thử lại sau.');
      }
      return;
    }

    // State D: Nhập tài khoản vào danh mục
    if (adminState.state === 'WAITING_ADMIN_IMPORT') {
      const categoryId = adminState.category_id;
      const items = text.split('\n').map(i => i.trim()).filter(i => i.length > 0);

      if (items.length === 0) {
        return ctx.reply('⚠️ Không tìm thấy nội dung tài khoản hợp lệ. Vui lòng gửi lại:');
      }

      try {
        const addedItems = await db.adminAddItems(categoryId, items);
        adminHandler.clearAdminState(tg_id);

        const category = await db.getCategory(categoryId);
        await ctx.replyWithMarkdown(
          `✅ *Thêm link thành công!*\n\n` +
          `📦 Đã bổ sung *${addedItems.length}* link vào *${category?.name || ''}*.`,
          Markup.inlineKeyboard([
            [Markup.button.callback('➕ Nhập tiếp', 'admin_import_select')],
            [Markup.button.callback('⚙️ Bảng Quản Trị', 'menu_admin')]
          ])
        );
      } catch (error) {
        console.error('Lỗi nhập kho admin:', error);
        adminHandler.clearAdminState(tg_id);
        await ctx.reply('⚠️ Đã xảy ra lỗi hệ thống khi nhập tài khoản. Vui lòng thử lại sau.');
      }
      return;
    }
  }

  // Tin nhắn tự do — hướng dẫn dùng menu
  if (!text.startsWith('/')) {
    await ctx.replyWithMarkdown(
      `💬 *Vui lòng chọn dịch vụ qua menu nhé!*\n\n` +
        `Gõ /start để xem bảng giá và mua album / book lịch.\n` +
        `Muốn chat trực tiếp? Book lịch gói *20.000đ* (Hà Nội) 💕`,
      Markup.inlineKeyboard([[Markup.button.callback('✨ Mở Menu', 'menu_main')]])
    );
  }
});

// Xử lý khi có lỗi xảy ra trong bot
bot.catch((err, ctx) => {
  console.error(`[Telegraf Error] Có lỗi xảy ra trong bot chat với user ${ctx.from?.id}:`, err);
  ctx.reply('⚠️ Hệ thống đang quá tải hoặc gặp lỗi. Vui lòng thử lại sau ít phút.').catch(() => {});
});

module.exports = bot;
