const crypto = require('crypto');

const batches = new Map();

function createBatch(usernames) {
  const id = crypto.randomUUID();
  const jobs = usernames
    .map((raw) => ({
      id: crypto.randomUUID(),
      username: String(raw).trim().replace(/^@/, ''),
      status: 'pending',
      logs: [],
      result: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    }))
    .filter((job) => job.username);

  const batch = {
    id,
    status: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    jobs,
  };

  batches.set(id, batch);
  return batch;
}

function getBatch(batchId) {
  return batches.get(batchId) || null;
}

function listBatches() {
  return [...batches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function updateBatch(batchId, patch) {
  const batch = batches.get(batchId);
  if (!batch) return null;
  Object.assign(batch, patch);
  return batch;
}

function updateJob(batchId, jobId, patch) {
  const batch = batches.get(batchId);
  if (!batch) return null;
  const job = batch.jobs.find((item) => item.id === jobId);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

function appendJobLog(batchId, jobId, message) {
  const batch = batches.get(batchId);
  if (!batch) return;
  const job = batch.jobs.find((item) => item.id === jobId);
  if (!job) return;
  job.logs.push({ at: new Date().toISOString(), message });
  if (job.logs.length > 100) job.logs.shift();
}

function refreshBatchStatus(batchId) {
  const batch = batches.get(batchId);
  if (!batch) return null;

  const statuses = batch.jobs.map((job) => job.status);
  if (statuses.every((s) => s === 'success' || s === 'failed')) {
    batch.status = statuses.every((s) => s === 'success') ? 'completed' : 'completed_with_errors';
    batch.finishedAt = batch.finishedAt || new Date().toISOString();
  } else if (statuses.some((s) => s === 'running')) {
    batch.status = 'running';
  }

  return batch;
}

module.exports = {
  createBatch,
  getBatch,
  listBatches,
  updateBatch,
  updateJob,
  appendJobLog,
  refreshBatchStatus,
};