const express = require('express');
const jobStore = require('./job-store');
const { parseUsernameList, startBatch, DEFAULT_CONCURRENCY } = require('./job-runner');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, concurrency: DEFAULT_CONCURRENCY });
});

router.get('/batches', (_req, res) => {
  res.json({ batches: jobStore.listBatches() });
});

router.get('/batches/:batchId', (req, res) => {
  const batch = jobStore.getBatch(req.params.batchId);
  if (!batch) return res.status(404).json({ error: 'Batch không tồn tại' });
  res.json(batch);
});

router.post('/batches', (req, res) => {
  const text = req.body?.usernames || req.body?.text || '';
  const usernames = parseUsernameList(text);

  if (!usernames.length) {
    return res.status(400).json({ error: 'Danh sách username trống' });
  }

  const batch = jobStore.createBatch(usernames);
  startBatch(batch.id);

  res.json({
    batchId: batch.id,
    total: batch.jobs.length,
    concurrency: DEFAULT_CONCURRENCY,
    message: `Đã xếp hàng ${batch.jobs.length} tác vụ (tối đa ${DEFAULT_CONCURRENCY} song song)`,
  });
});

module.exports = router;