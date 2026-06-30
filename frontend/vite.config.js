import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingDir = path.resolve(__dirname, 'landing');

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function landingPagePlugin() {
  return {
    name: 'landing-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';

        if (url === '/' || url === '/index.html') {
          const html = fs.readFileSync(path.join(landingDir, 'index.html'), 'utf-8');
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }

        if (url.startsWith('/assets/') && !url.startsWith('/admin-panel')) {
          const assetPath = path.join(landingDir, url.slice(1));
          if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
            const ext = path.extname(assetPath).toLowerCase();
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
            fs.createReadStream(assetPath).pipe(res);
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  base: '/admin-panel/',
  plugins: [react(), landingPagePlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
