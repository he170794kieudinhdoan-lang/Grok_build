const express = require('express');
const path = require('path');
const cors = require('cors');
const { getPublicDir } = require('../app-root');
const giftRoutes = require('./gift-routes');

function createGiftApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/gift', giftRoutes);
  app.use('/gift', express.static(getPublicDir('gift')));
  app.get('/', (_req, res) => res.redirect('/gift'));
  app.get('/gift', (_req, res) => {
    res.sendFile(path.join(getPublicDir('gift'), 'index.html'));
  });
  return app;
}

function startGiftServer(port = process.env.GIFT_UI_PORT || 3003) {
  const app = createGiftApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`[Gift UI] http://localhost:${port}/gift`);
      console.log(`[Gift UI] Concurrency: ${process.env.GIFT_CONCURRENCY || 1}`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} đang được dùng — đổi GIFT_UI_PORT trong .env`));
      } else {
        reject(error);
      }
    });
  });
}

if (require.main === module) {
  const { loadEnv, configurePlaywright } = require('../app-root');
  loadEnv();
  configurePlaywright();
  startGiftServer().catch((error) => {
    console.error('[Gift UI] Lỗi:', error.message);
    process.exit(1);
  });
}

module.exports = {
  createGiftApp,
  startGiftServer,
};