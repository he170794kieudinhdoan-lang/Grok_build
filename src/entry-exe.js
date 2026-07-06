const path = require('path');
const fs = require('fs');
const { configurePlaywright, getPlaywrightModulesDir, isPackaged } = require('./app-root');

configurePlaywright();

if (isPackaged()) {
  const Module = require('module');
  const modulesDir = getPlaywrightModulesDir();
  const originalResolve = Module._resolveFilename;

  Module._resolveFilename = function resolvePackaged(request, parent, isMain, options) {
    if (request === 'playwright' || request.startsWith('playwright/')) {
      const external = path.join(modulesDir, request);
      if (fs.existsSync(external) || fs.existsSync(`${external}.js`)) {
        return originalResolve.call(this, external, parent, isMain, options);
      }
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };
}

async function installBrowsers() {
  console.log(`[Setup] Cài Chromium vào: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);
  const registryPath = path.join(
    getPlaywrightModulesDir(),
    'playwright-core',
    'lib',
    'server',
    'registry',
    'index.js'
  );
  const { registry } = require(registryPath);
  await registry.install(['chromium'], false);
  const { chromium } = require('playwright');
  const exe = chromium.executablePath();
  console.log(`[Setup] Xong: ${exe}`);
}

async function main() {
  if (process.argv.includes('--install-browsers')) {
    await installBrowsers();
    return;
  }

  require('./gift-only');
}

main().catch((error) => {
  console.error('❌ Lỗi:', error.message);
  process.exit(1);
});