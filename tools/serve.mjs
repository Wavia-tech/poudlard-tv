// Serveur statique minimal pour la maquette web, sans dépendance.
//
// Usage : node tools/serve.mjs [racine] [port]
//         node tools/serve.mjs . 8765      → http://localhost:8765/app/index.html
//
// Il n'écoute que sur 127.0.0.1 (jamais exposé au réseau), ne met rien en cache (cache-control: no-store, pour
// voir chaque modification au rechargement) et ne sert que des fichiers situés SOUS la racine : la racine est
// résolue en chemin absolu et chaque requête est comparée à ce chemin, séparateur compris, pour qu'une URL du type
// `/../secret` soit refusée (403) quelle que soit la façon d'écrire la racine (`.`, `./`, chemin relatif ou absolu).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';

const rootAbs = resolve(process.argv[2] || '.');   // racine absolue, sans séparateur final
const port = Number(process.argv[3] || 8765);

// Types MIME des fichiers de la maquette. Tout le reste part en application/octet-stream.
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
  '.mp3': 'audio/mpeg',       // musique de fond personnelle (assets/music/ambiance.mp3, hors dépôt)
  '.ogg': 'audio/ogg',        // idem, ambiance.ogg
  '.mp4': 'video/mp4',
};

// Vrai si `p` est la racine elle-même ou un chemin situé dessous (comparaison avec le séparateur, pour que
// `C:\tv-home-bis` ne passe pas pour un enfant de `C:\tv-home`).
const insideRoot = (p) => p === rootAbs || p.startsWith(rootAbs + sep);

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // `'.' + url` : un chemin d'URL commence par `/` ; on le rend relatif à la racine avant de le résoudre.
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
}).listen(port, '127.0.0.1', () => console.log(`Poudlard TV : ${rootAbs} servi sur http://127.0.0.1:${port}/app/index.html`));
