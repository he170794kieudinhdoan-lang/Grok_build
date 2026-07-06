const path = require('path');
const fs = require('fs');

function isPackaged() {
  if (typeof process.pkg !== 'undefined') return true;
  const exeDir = path.dirname(process.execPath);
  return fs.existsSync(path.join(exeDir, 'public', 'gift', 'index.html'));
}

function getAppRoot() {
  const exeDir = path.dirname(process.execPath);
  if (isPackaged()) {
    return exeDir;
  }
  return path.resolve(__dirname, '..');
}

function getPublicDir(...segments) {
  return path.join(getAppRoot(), 'public', ...segments);
}

function loadEnv() {
  const dotenv = require('dotenv');
  const envPath = path.join(getAppRoot(), '.env');

  if (!fs.existsSync(envPath) && isPackaged()) {
    const examplePath = path.join(getAppRoot(), '.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      console.warn(`[Config] Đã tạo .env từ .env.example — hãy điền cookie X trước khi chạy.`);
    }
  }

  dotenv.config({ path: envPath });
  return envPath;
}

function configurePlaywright() {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(getAppRoot(), 'ms-playwright');
  }
}

function getPlaywrightModulesDir() {
  return path.join(getAppRoot(), 'playwright-modules');
}

module.exports = {
  isPackaged,
  getAppRoot,
  getPublicDir,
  loadEnv,
  configurePlaywright,
  getPlaywrightModulesDir,
};