const { runGiftJob } = require('./run-gift-job');
const jobStore = require('./job-store');

const DEFAULT_CONCURRENCY = parseInt(process.env.GIFT_CONCURRENCY || '1', 10);

async function runJobWithStore(batchId, job) {
  jobStore.updateJob(batchId, job.id, {
    status: 'running',
    startedAt: new Date().toISOString(),
  });
  jobStore.refreshBatchStatus(batchId);

  const result = await runGiftJob({
    username: job.username,
    headless: true,
    submit: true,
    onLog: (message) => jobStore.appendJobLog(batchId, job.id, message),
  });

  jobStore.updateJob(batchId, job.id, {
    status: result.success ? 'success' : 'failed',
    result,
    error: result.error || null,
    finishedAt: new Date().toISOString(),
  });
  jobStore.refreshBatchStatus(batchId);

  return result;
}

async function runWithConcurrency(items, worker, concurrency = DEFAULT_CONCURRENCY) {
  const results = [];
  let index = 0;

  async function workerLoop() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => workerLoop());
  await Promise.all(workers);
  return results;
}

function startBatch(batchId, concurrency = DEFAULT_CONCURRENCY) {
  const batch = jobStore.getBatch(batchId);
  if (!batch) throw new Error('Batch không tồn tại');

  jobStore.updateBatch(batchId, {
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  // Chạy ngầm — không await ở HTTP handler
  runWithConcurrency(
    batch.jobs,
    (job) => runJobWithStore(batchId, job),
    concurrency
  )
    .then(() => {
      jobStore.refreshBatchStatus(batchId);
      const updated = jobStore.getBatch(batchId);
      console.log(`[GiftRunner] Batch ${batchId} xong — ${updated?.status}`);
    })
    .catch((error) => {
      console.error(`[GiftRunner] Batch ${batchId} lỗi:`, error.message);
      jobStore.updateBatch(batchId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: error.message,
      });
    });

  return batch;
}

function parseUsernameList(text) {
  return [...new Set(
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^@/, ''))
      .filter(Boolean)
  )];
}

module.exports = {
  DEFAULT_CONCURRENCY,
  parseUsernameList,
  startBatch,
};