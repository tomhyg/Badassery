import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Read a value from a .env file without any variable expansion.
// Handles the case where the value contains $ (dotenv expands it incorrectly).
function readRawEnv(filePath: string, key: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
  } catch {
    return '';
  }
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const rootEnv  = path.resolve(__dirname, '../../.env');
    const piKey    = readRawEnv(rootEnv, 'PODCASTINDEX_API_KEY');
    const piSecret = readRawEnv(rootEnv, 'PODCASTINDEX_API_SECRET');

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/podcastindex': {
            target: 'https://api.podcastindex.org',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/podcastindex/, '/api/1.0'),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                const epoch = Math.floor(Date.now() / 1000);
                const hash  = crypto
                  .createHash('sha1')
                  .update(piKey + piSecret + String(epoch))
                  .digest('hex');
                proxyReq.setHeader('X-Auth-Date',   String(epoch));
                proxyReq.setHeader('X-Auth-Key',    piKey);
                proxyReq.setHeader('Authorization', hash);
                proxyReq.setHeader('User-Agent',    'BadasseryPR/1.0');
              });
            },
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
