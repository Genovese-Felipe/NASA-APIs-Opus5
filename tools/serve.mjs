#!/usr/bin/env node
/**
 * A dependency-free static file server for local development.
 *
 * The published site is plain static files, so serving them with anything more
 * elaborate would hide problems rather than reveal them. This server mirrors
 * GitHub Pages closely: correct MIME types, no directory rewriting beyond
 * `index.html`, and a real 404 page.
 *
 * Usage:  node tools/serve.mjs [--port 8080] [--root .]
 */

import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PORT = parseInt(getArg('port', process.env.PORT || '8080'), 10);
const ROOT = resolve(getArg('root', resolve(fileURLToPath(import.meta.url), '../..')));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Contain the served path inside ROOT.
  const target = normalize(join(ROOT, pathname));
  if (!target.startsWith(ROOT + sep) && target !== ROOT) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!existsSync(target) || !statSync(target).isFile()) {
    const notFound = join(ROOT, '404.html');
    if (existsSync(notFound)) {
      res.writeHead(404, { 'content-type': MIME['.html'] });
      createReadStream(notFound).pipe(res);
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('404 Not Found');
    }
    return;
  }

  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-cache',
    // Mirror the isolation headers a production deployment would set.
    'cross-origin-opener-policy': 'same-origin',
  });
  createReadStream(target).pipe(res);
});

server.listen(PORT, () => {
  process.stdout.write(`ORRERY dev server: http://localhost:${PORT}/  (root: ${ROOT})\n`);
});
