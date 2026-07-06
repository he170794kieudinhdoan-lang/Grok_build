const db = require('../db');
const config = require('../config');
const { Markup } = require('telegraf');

// Lưu trạng thái nhập liệu admin
const adminStates = new Map();

/**
 * Kiểm tra xem người dùng có phải admin không
 */
async function isAdmin(tg_id) {
  if (config.TELEGRAM_ADMIN_ID && tg_id === config.TELEGRAM_ADMIN_ID) {
    return true;
  }
  const user = await db.getUser(tg_id);
  return user && user.role === 'admin';
}

/**
 * Hiển thị bảng điều khiển admin
 */
async function showAdminPanel(ctx) {
  const tg_id = ctx.from.id;
  
  if (!(await isAdmin(tg_id))) {
    return ctx.answerCbQuery('⚠️ Bạn không có quyền truy cập chức năng này!', { show_alert: true });
  }

  try {
    const stats = await db.adminGetStats();
    
    const text = `⚙️ *BẢNG QUẢN TRỊ BOT*\n\n` +
                 `👥 Tổng khách hàng: *${stats.totalUsers}*\n` +
                 `🛒 Tổng đơn hàng: *${stats.totalSales}*\n` +
                 `💵 Tổng doanh thu: *${Number(stats.totalRevenue).toLocaleString('vi-VN')} đ*\n` +
                 `📦 Link album còn trong kho: *${stats.stockCount}*\n\n` +
                 `Chọn chức năng quản lý:`;

    const buttons = [
      [
        Markup.button.callback('➕ Thêm Link Album', 'admin_import_select'),
        Markup.button.callback('📦 Xem Kho', 'admin_stock_view')
      ],
      [
        Markup.button.callback('📅 Đơn Book Lịch', 'admin_bookings')
      ],
      [Markup.button.callback('🏠 Về Menu chính', 'menu_main')]
    ];

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      await ctx.answerCbQuery().catch(() => {});
    } else {
      await ctx.replyWithMarkdown(text, keyboard);
    }
  } catch (error) {
    console.error('Lỗi khi tải bảng quản trị:', error);
    await ctx.reply('⚠️ Lỗi khi tải dữ liệu quản trị.');
  }
}

/**
 * Quản lý danh mục sản phẩm (Admin)
 */
async function showAdminCategories(ctx) {
  const tg_id = ctx.from.id;
  if (!(await isAdmin(tg_id))) return;

  try {
    const categories = await db.getCategories();
    
    let text = `📁 *QUẢN LÝ DANH MỤC SẢN PHẨM*\n\n` +
               `Dưới đây là danh sách các danh mục hiện tại. Bấm nút **Xóa** để gỡ bỏ (Hành động này sẽ xóa toàn bộ tài khoản thuộc danh mục đó):`;

    const buttons = [];
    
    for (const cat of categories) {
      const priceFormatted = Number(cat.price).toLocaleString('vi-VN');
      buttons.push([
        Markup.button.callback(`${cat.name} (${priceFormatted}đ)`, 'noop'),
        Markup.button.callback('🗑️ Xóa', `admin_delcat_${cat.id}`)
      ]);
    }

    buttons.push([
      Markup.button.callback('➕ Tạo Nhanh Danh Mục', 'admin_create_cat_init')
    ]);
    buttons.push([
      Markup.button.callback('⬅️ Quay lại Panel', 'menu_admin')
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } catch (error) {
    console.error('Lỗi danh sách danh mục admin:', error);
    await ctx.reply('⚠️ Lỗi khi tải danh sách danh mục.');
  }
}

/**
 * Xóa danh mục (Admin)
 */
async function deleteCategory(ctx, categoryId) {
  const tg_id = ctx.from.id;
  if (!(await isAdmin(tg_id))) return;

  try {
    await db.adminDeleteCategory(categoryId);
    await ctx.answerCbQuery('Đã xóa danh mục thành công!', { show_alert: false }).catch(() => {});
    await showAdminCategories(ctx);
  } catch (error) {
    console.error('Lỗi xóa danh mục:', error);
    await ctx.answerCbQuery('⚠️ Lỗi khi xóa danh mục.', { show_alert: true }).catch(() => {});
  }
}

/**
 * Lựa chọn danh mục để nhập tài khoản hàng loạt
 */
async function showImportSelect(ctx) {
  const tg_id = ctx.from.id;
  if (!(await isAdmin(tg_id))) return;

  try {
    const categories = await db.getCategories();
    
    if (!categories || categories.length === 0) {
      await ctx.answerCbQuery('⚠️ Vui lòng tạo danh mục trước khi nhập tài khoản.', { show_alert: true });
      return showAdminPanel(ctx);
    }

    const albumCategories = categories.filter(
      (cat) => cat.name === 'Album Ảnh' || cat.name === 'Album Ảnh + Video'
    );

    if (albumCategories.length === 0) {
      await ctx.answerCbQuery('⚠️ Chưa có danh mục album. Khởi động lại bot để seed.', { show_alert: true });
      return showAdminPanel(ctx);
    }

    let text = `📥 *THÊM LINK ALBUM VÀO KHO*\n\n` +
               `Chọn loại album cần thêm link (mỗi dòng = 1 link cho 1 khách):`;

    const buttons = albumCategories.map(cat => [
      Markup.button.callback(cat.name, `admin_import_to_${cat.id}`)
    ]);
    
    buttons.push([Markup.button.callback('⬅️ Quay lại Panel', 'menu_admin')]);

    const keyboard = Markup.inlineKeyboard(buttons);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } catch (error) {
    console.error('Lỗi import select:', error);
    await ctx.reply('⚠️ Gặp lỗi khi tải danh sách sản phẩm.');
  }
}

/**
 * Xem chi tiết chi tiết số lượng sản phẩm có trong kho (Admin)
 */
async function showStockView(ctx) {
  const tg_id = ctx.from.id;
  if (!(await isAdmin(tg_id))) return;

  try {
    const stockDetails = await db.adminGetCategoriesStock();

    if (!stockDetails || stockDetails.length === 0) {
      const text = `ℹ️ *Chưa có danh mục sản phẩm nào được thiết lập.*\n\nHãy tạo danh mục trước!`;
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tạo Danh Mục', 'admin_create_cat_init')],
        [Markup.button.callback('⬅️ Quay Lại', 'menu_admin')]
      ]);
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      return;
    }

    let text = `📦 *BÁO CÁO CHI TIẾT KHO HÀNG HỆ THỐNG*\n\n`;

    stockDetails.forEach((cat, index) => {
      const priceFormatted = Number(cat.price).toLocaleString('vi-VN');
      const availText = cat.available > 0 ? `*${cat.available}* link` : `🔴 *HẾT HÀNG*`;

      text += `${index + 1}. *${cat.name}* (${priceFormatted} đ)\n` +
              `   🔹 Còn hàng: ${availText}\n` +
              `   🔸 Đã bán: *${cat.sold}* link\n` +
              `───────────────────\n`;
    });

    const buttons = [
      [
        Markup.button.callback('➕ Nhập hàng ngay', 'admin_import_select'),
        Markup.button.callback('📁 Quản lý Danh mục', 'admin_categories')
      ],
      [Markup.button.callback('⬅️ Quay lại Panel', 'menu_admin')]
    ];
    const keyboard = Markup.inlineKeyboard(buttons);

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } catch (error) {
    console.error('Lỗi khi tải chi tiết kho:', error);
    await ctx.reply('⚠️ Có lỗi xảy ra khi tải báo cáo chi tiết kho.');
  }
}

// Helper quản lý state nhập dữ liệu Admin
function setAdminState(tg_id, stateObj) {
  adminStates.set(tg_id, stateObj);
}

function getAdminState(tg_id) {
  return adminStates.get(tg_id);
}

function clearAdminState(tg_id) {
  adminStates.delete(tg_id);
}

/**
 * Xem danh sách đơn book lịch
 */
async function showBookings(ctx) {
  const tg_id = ctx.from.id;
  if (!(await isAdmin(tg_id))) return;

  try {
    const bookings = await db.getBookingOrders(15);

    if (!bookings || bookings.length === 0) {
      const text = `ℹ️ *Chưa có đơn book lịch nào.*`;
      const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Quay lại', 'menu_admin')]]);
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      return;
    }

    let text = `📅 *ĐƠN BOOK LỊCH GẦN ĐÂY*\n\n`;

    for (const [index, order] of bookings.entries()) {
      const date = new Date(order.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const info = order.items?.content || '⏳ Chưa có thông tin / Khách không ở HN';
      const shortInfo = info.length > 120 ? info.substring(0, 120) + '...' : info;

      text += `${index + 1}. Đơn \`${order.id}\` — ${Number(order.price).toLocaleString('vi-VN')}đ\n` +
              `   👤 TG: \`${order.tg_id}\`\n` +
              `   ⏰ ${date}\n` +
              `   📝 ${shortInfo}\n` +
              `───────────────────\n`;
    }

    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Quay lại Panel', 'menu_admin')]]);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    await ctx.answerCbQuery().catch(() => {});
  } catch (error) {
    console.error('Lỗi xem đơn book lịch:', error);
    await ctx.reply('⚠️ Lỗi khi tải danh sách book lịch.');
  }
}

module.exports = {
  isAdmin,
  showAdminPanel,
  showAdminCategories,
  deleteCategory,
  showImportSelect,
  showStockView,
  showBookings,
  setAdminState,
  getAdminState,
  clearAdminState
};
