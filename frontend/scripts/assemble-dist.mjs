import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const distDir = path.join(frontendRoot, 'dist');
const landingDir = path.join(frontendRoot, 'landing');
const adminPanelDir = path.join(distDir, 'admin-panel');

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found — run vite build first');
  process.exit(1);
}

fs.mkdirSync(adminPanelDir, { recursive: true });

for (const entry of fs.readdirSync(distDir)) {
  if (entry === 'admin-panel') continue;
  fs.renameSync(path.join(distDir, entry), path.join(adminPanelDir, entry));
}

fs.copyFileSync(path.join(landingDir, 'index.html'), path.join(distDir, 'index.html'));

const landingAssets = path.join(landingDir, 'assets');
const distAssets = path.join(distDir, 'assets');
if (fs.existsSync(landingAssets)) {
  fs.mkdirSync(distAssets, { recursive: true });
  for (const file of fs.readdirSync(landingAssets)) {
    fs.copyFileSync(path.join(landingAssets, file), path.join(distAssets, file));
  }
}

console.log('Build assembled: / = landing page, /admin-panel = ERP app');
