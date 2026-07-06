const { Markup } = require('telegraf');
const jobStore = require('../automation/job-store');
const { parseUsernameList, startBatch, DEFAULT_CONCURRENCY } = require('../automation/job-runner');

function getAdminId() {
  const id = parseInt(process.env.TELEGRAM_ADMIN_ID || '', 10);
  return Number.isFinite(id) ? id : null;
}

function isAdmin(ctx) {
  const adminId = getAdminId();
  return adminId !== null && ctx.from?.id === adminId;
}

function formatBatchSummary(batch) {
  const success = batch.jobs.filter((j) => j.status === 'success').length;
  const failed = batch.jobs.filter((j) => j.status === 'failed').length;
  const running = batch.jobs.filter((j) => j.status === 'running').length;
  const pending = batch.jobs.filter((j) => j.status === 'pending').length;

  return (
    `📦 *Batch:* \`${batch.id.slice(0, 8)}…\`\n` +
    `📊 Trạng thái: *${batch.status}*\n` +
    `✅ ${success} | ❌ ${failed} | ⏳ ${running} | 🕐 ${pending}\n` +
    `🕒 Tạo lúc: ${new Date(batch.createdAt).toLocaleString('vi-VN')}`
  );
}

function formatJobLine(job) {
  const icon = job.status === 'success' ? '✅' : job.status === 'failed' ? '❌' : job.status === 'running' ? '⏳' : '🕐';
  let line = `${icon} @${job.username}`;
  if (job.error) line += `\n   _${job.error}_`;
  return line;
}

async function notifyJobComplete(ctx, batchId, job) {
  const icon = job.status === 'success' ? '✅' : '❌';
  let text = `${icon} *@${job.username}* — ${job.status === 'success' ? 'thành công' : 'thất bại'}`;
  if (job.error) text += `\n_${job.error}_`;
  if (job.result?.checkoutUrl) {
    text += `\n🔗 \`${job.result.checkoutUrl.slice(0, 60)}…\``;
  }
  await ctx.replyWithMarkdown(text).catch(() => {});
}

async function notifyBatchComplete(ctx, batch) {
  const lines = batch.jobs.map(formatJobLine).join('\n');
  const text =
    `🏁 *Batch hoàn tất*\n\n` +
    `${formatBatchSummary(batch)}\n\n` +
    `*Chi tiết:*\n${lines}`;

  await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
    [Markup.button.callback('📋 Xem batches', 'gift_batches')],
  ])).catch(() => {});
}

async function showMainMenu(ctx) {
  const label = process.env.ACCOUNT_LABEL || 'Account 2';
  const adminId = getAdminId();
  const isUserAdmin = isAdmin(ctx);

  let text =
    `🎁 *Gift Premium Runner — ${label}*\n\n` +
    `Bot chạy gift X Premium qua Telegram thay vì website.\n\n`;

  if (isUserAdmin) {
    text +=
      `*Cách dùng (admin):*\n` +
      `1. Gửi danh sách username (mỗi dòng 1 user)\n` +
      `2. Bot tự chạy lần lượt (tối đa ${DEFAULT_CONCURRENCY} song song)\n` +
      `3. Nhận thông báo từng user + khi batch xong\n\n` +
      `*Lệnh:*\n` +
      `/status — xem batch gần đây\n` +
      `/help — hướng dẫn`;
  } else {
    text += `⚠️ Bot chỉ dành cho admin (ID: \`${adminId || 'chưa cấu hình'}\`).`;
  }

  const keyboard = isUserAdmin
    ? Markup.inlineKeyboard([
        [Markup.button.callback('📋 Danh sách batch', 'gift_batches')],
        [Markup.button.callback('❓ Hướng dẫn', 'gift_help')],
      ])
    : undefined;

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...(keyboard || {}) });
    await ctx.answerCbQuery().catch(() => {});
  } else {
    await ctx.replyWithMarkdown(text, keyboard);
  }
}

async function showHelp(ctx) {
  if (!isAdmin(ctx)) {
    return ctx.reply('⚠️ Chỉ admin mới dùng được bot này.');
  }

  await ctx.replyWithMarkdown(
    `📖 *Hướng dẫn Gift Bot*\n\n` +
      `*Gửi batch mới:* paste danh sách username, mỗi dòng một user:\n` +
      `\`user1\`\n\`@user2\`\n\`user3\`\n\n` +
      `*Lệnh:*\n` +
      `/status — 5 batch gần nhất\n` +
      `/batch \`<id>\` — chi tiết 1 batch\n\n` +
      `*Yêu cầu .env:*\n` +
      `• \`TELEGRAM_BOT_TOKEN\`\n` +
      `• \`TELEGRAM_ADMIN_ID\` (ID Telegram của bạn)\n` +
      `• \`X_AUTH_TOKEN\`, \`X_CT0\` (cookie tài khoản X)\n\n` +
      `⚠️ Bot phải chạy trên VPS/Railway (có Playwright), không chạy Vercel.`
  );
}

async function showBatches(ctx) {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery?.('Chỉ admin.', { show_alert: true }) || ctx.reply('⚠️ Chỉ admin.');
  }

  const batches = jobStore.listBatches().slice(0, 5);
  if (!batches.length) {
    const text = '📭 Chưa có batch nào. Gửi danh sách username để bắt đầu.';
    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(text, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery().catch(() => {});
    } else {
      await ctx.reply(text);
    }
    return;
  }

  let text = '📋 *Batch gần đây:*\n\n';
  batches.forEach((batch, i) => {
    text += `${i + 1}. ${formatBatchSummary(batch)}\n\n`;
  });
  text += `_Dùng_ /batch \`<uuid>\` _để xem chi tiết._`;

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Menu', 'gift_menu')],
    ]) });
    await ctx.answerCbQuery().catch(() => {});
  } else {
    await ctx.replyWithMarkdown(text);
  }
}

async function showBatchDetail(ctx, batchId) {
  if (!isAdmin(ctx)) {
    return ctx.reply('⚠️ Chỉ admin.');
  }

  const batch = jobStore.getBatch(batchId);
  if (!batch) {
    return ctx.reply('⚠️ Không tìm thấy batch. Kiểm tra lại ID.');
  }

  const lines = batch.jobs.map(formatJobLine).join('\n');
  const text = `${formatBatchSummary(batch)}\n\n*Jobs:*\n${lines}`;

  await ctx.replyWithMarkdown(text);
}

async function handleUsernameList(ctx, text) {
  if (!isAdmin(ctx)) {
    return ctx.reply('⚠️ Chỉ admin mới chạy gift batch.');
  }

  if (process.env.VERCEL) {
    return ctx.replyWithMarkdown(
      '⚠️ *Gift automation không chạy trên Vercel.*\n\n' +
        'Playwright cần máy chạy liên tục.\n\n' +
        'Chạy trên máy/VPS:\n' +
        '`npm start`\n\n' +
        'Vercel chỉ dùng cho webhook Telegram (lệnh /start, /status…).'
    );
  }

  const usernames = parseUsernameList(text);
  if (!usernames.length) {
    return ctx.reply('⚠️ Danh sách username trống. Gửi mỗi username trên một dòng.');
  }

  const batch = jobStore.createBatch(usernames);

  await ctx.replyWithMarkdown(
    `🚀 *Đã xếp hàng ${batch.jobs.length} user*\n` +
      `Batch: \`${batch.id}\`\n` +
      `Concurrency: ${DEFAULT_CONCURRENCY}\n\n` +
      `_Đang chạy… sẽ báo từng user khi xong._`
  );

  startBatch(batch.id, {
    onJobComplete: (job) => notifyJobComplete(ctx, batch.id, job),
    onBatchComplete: (completed) => notifyBatchComplete(ctx, completed),
  });
}

module.exports = {
  showMainMenu,
  showHelp,
  showBatches,
  showBatchDetail,
  handleUsernameList,
  isAdmin,
};
