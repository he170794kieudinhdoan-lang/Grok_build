const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const accountLabel = process.env.ACCOUNT_LABEL || 'Account 2';
const exeName =
  process.env.EXE_NAME ||
  (accountLabel.includes('2') ? 'GiftRunner-Account2' : 'GiftRunner-Account1');
const defaultPort = accountLabel.includes('2') ? '3003' : '3001';

function rm(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function writeBat(name, lines) {
  fs.writeFileSync(path.join(dist, name), `${lines.join('\r\n')}\r\n`, 'utf8');
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

console.log(`[Build] ${accountLabel} → ${exeName}.exe`);

rm(dist);
rm(path.join(root, 'build'));
fs.mkdirSync(dist, { recursive: true });

console.log('[Build] Bundle JS (ncc)...');
run(
  `npx ncc build src/entry-exe.js -o build/bundle -e playwright -e playwright-core -q`
);

console.log('[Build] caxa → EXE...');
const caxaOut = path.join(dist, `${exeName}.exe`);
run(
  `npx caxa --input build/bundle --output "${caxaOut}" -- node "{{caxa}}/index.js"`
);

console.log('[Build] Copy public/...');
copyDir(path.join(root, 'public'), path.join(dist, 'public'));

console.log('[Build] Copy playwright-modules/...');
const pwModules = path.join(dist, 'playwright-modules');
fs.mkdirSync(pwModules, { recursive: true });
copyDir(path.join(root, 'node_modules', 'playwright'), path.join(pwModules, 'playwright'));
copyDir(
  path.join(root, 'node_modules', 'playwright-core'),
  path.join(pwModules, 'playwright-core')
);

const envExample = path.join(root, '.env.gift.example');
const envTarget = path.join(dist, '.env.example');
if (fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envTarget);
}

writeBat('Start.bat', [
  '@echo off',
  'cd /d "%~dp0"',
  `title Gift Premium Runner — ${accountLabel}`,
  `set PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright`,
  `start "" "${exeName}.exe"`,
  'timeout /t 2 >nul',
  `echo Mo http://localhost:${defaultPort}/gift (hoac port trong .env)`,
  'echo.',
  'echo Gift UI dang chay. Dong cua so nay KHONG tat app.',
  'pause',
]);

writeBat('Install-Browser.bat', [
  '@echo off',
  'cd /d "%~dp0"',
  'set PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright',
  'echo Dang cai Chromium cho Playwright (~200MB)...',
  `"%~dp0${exeName}.exe" --install-browsers`,
  'echo.',
  'echo Xong. Chay Start.bat hoac double-click EXE.',
  'pause',
]);

console.log('[Build] Install Chromium vao dist/ms-playwright...');
run('npx playwright install chromium', {
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: path.join(dist, 'ms-playwright'),
  },
});

const sizeMb = (fs.statSync(caxaOut).size / 1024 / 1024).toFixed(1);
console.log('');
console.log('=== Xong ===');
console.log(`EXE: ${caxaOut} (${sizeMb} MB)`);
console.log(`Thu muc: ${dist}`);
console.log('1. Copy/sua .env.example thanh .env (dien cookie X)');
console.log('2. Chay Install-Browser.bat neu chua co ms-playwright');
console.log(`3. Double-click ${exeName}.exe hoac Start.bat`);
console.log('4. Zip ca thu muc dist/ de chia se (~400MB co Chromium)');
console.log('');