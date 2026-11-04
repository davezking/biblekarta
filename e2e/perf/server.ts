// A small static server for the perf builds, with gzip as Cloudflare Pages serves them, so the
// LCP measurement under Fast 3G sees realistic transfer sizes.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { createGzip } from 'node:zlib';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml']);

async function resolveFile(root: string, urlPath: string): Promise<string | null> {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]!)).replace(/^([/\\])+/, '');
  const file = join(root, clean);
  if (!file.startsWith(root + sep) && file !== root) return null;
  for (const candidate of [file, join(file, 'index.html'), `${file}.html`]) {
    const s = await stat(candidate).catch(() => null);
    if (s?.isFile()) return candidate;
  }
  return null;
}

export function serve(root: string, port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(root, req.url ?? '/');
    if (!file) {
      res.writeHead(404).end('not found');
      return;
    }
    const ext = extname(file);
    const headers: Record<string, string> = {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
    };
    const gzip = COMPRESS.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (gzip) headers['content-encoding'] = 'gzip';
    res.writeHead(200, headers);
    const stream = createReadStream(file);
    (gzip ? stream.pipe(createGzip()) : stream).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
