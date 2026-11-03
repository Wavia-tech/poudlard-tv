// Minimal static server for the web mock-up, no dependencies.
//
// Usage: node tools/serve.mjs [root] [port]
//        node tools/serve.mjs . 8765      → http://localhost:8765/app/index.html
//
// It listens on 127.0.0.1 only (never exposed to the network), caches nothing (cache-control: no-store, so that
// every change shows on reload) and serves only files located UNDER the root: the root is resolved to an absolute
// path and every request is compared against it, separator included, so that a URL such as `/../secret` is
// refused (403) however the root is written (`.`, `./`, relative or absolute path).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';

const rootAbs = resolve(process.argv[2] || '.');   // absolute root, without a trailing separator
const port = Number(process.argv[3] || 8765);

// MIME types of the mock-up's files. Everything else goes out as application/octet-stream.
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',       // personal background music (assets/music/ambiance.mp3, out of the repo)
  '.ogg': 'audio/ogg',        // same, ambiance.ogg
  '.mp4': 'video/mp4',
};

// True if `p` is the root itself or a path located under it (compared with the separator, so that
// `C:\tv-home-bis` does not pass for a child of `C:\tv-home`).
const insideRoot = (p) => p === rootAbs || p.startsWith(rootAbs + sep);

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // `'.' + url`: a URL path starts with `/`; we make it relative to the root before resolving it.
    let p = resolve(rootAbs, '.' + url);
    if (!insideRoot(p)) { res.writeHead(403); res.end('forbidden'); return; }
    let s = await stat(p).catch(() => null);
    if (s && s.isDirectory()) { p = join(p, 'index.html'); s = await stat(p).catch(() => null); }
    if (!s || !s.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const body = await readFile(p);
    res.writeHead(200, {
      'content-type': types[extname(p).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, '127.0.0.1', () => console.log(`Poudlard TV: ${rootAbs} served at http://127.0.0.1:${port}/app/index.html`));
