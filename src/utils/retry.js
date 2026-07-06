function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error) {
  const msg = error?.message || String(error);
  if (msg.includes('521') || msg.includes('Web server is down')) {
    return 'Supabase đang khởi động lại (lỗi 521). Project vừa resume cần 2–5 phút để sẵn sàng.';
  }
  if (msg.includes('ENOTFOUND')) {
    return 'Không tìm thấy server Supabase. Kiểm tra SUPABASE_URL trong .env.';
  }
  if (msg.includes('<!DOCTYPE html>')) {
    return 'Supabase chưa phản hồi (server đang down hoặc đang resume).';
  }
  return msg.length > 200 ? msg.substring(0, 200) + '...' : msg;
}

async function retry(fn, { attempts = 15, delayMs = 10000, label = 'Thao tác' } = {}) {
  let lastError;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const friendly = formatError(error);

      if (i < attempts) {
        console.warn(`[Retry] ${label} thất bại (${i}/${attempts}): ${friendly}`);
        console.warn(`[Retry] Thử lại sau ${delayMs / 1000}s...`);
        await sleep(delayMs);
      }
    }
  }

  const err = new Error(formatError(lastError));
  err.cause = lastError;
  throw err;
}

module.exports = { retry, formatError, sleep };