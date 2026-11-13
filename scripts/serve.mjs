import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.vcf': 'text/vcard; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

export function createStaticServer(siteDir) {
  const resolvedSiteDir = path.resolve(siteDir);

  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    const rawUrl = req.url || '/';
    // Reject protocol-relative paths so they can never be parsed as a different host
    if (rawUrl.startsWith('//')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    let reqUrl;
    let cleanPath;
    try {
      reqUrl = new URL(rawUrl, 'http://127.0.0.1');
      cleanPath = decodeURIComponent(reqUrl.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (cleanPath.includes('\0')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    let candidatePath = path.resolve(resolvedSiteDir, `.${cleanPath}`);
    if (
      candidatePath !== resolvedSiteDir &&
      !candidatePath.startsWith(resolvedSiteDir + path.sep)
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
      // Mirror GitHub Pages: /dir -> 301 /dir/ so relative URLs resolve correctly
      if (!reqUrl.pathname.endsWith('/')) {
        // Collapse leading slashes so e.g. "/\assets" (normalized to "//assets") can't
        // turn into a protocol-relative open redirect
        const safePath = `/${reqUrl.pathname.replace(/^\/+/, '')}/`;
        res.writeHead(301, { Location: `${safePath}${reqUrl.search}` });
        res.end();
        return;
      }
      candidatePath = path.join(candidatePath, 'index.html');
    }

    const sendFile = (statusCode, filePath, contentType) => {
      const stat = fs.statSync(filePath);
      res.writeHead(statusCode, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Internal Server Error');
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    };

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      const ext = path.extname(candidatePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      sendFile(200, candidatePath, contentType);
      return;
    }

    const notFoundPath = path.join(resolvedSiteDir, '404.html');
    if (fs.existsSync(notFoundPath)) {
      sendFile(404, notFoundPath, 'text/html; charset=utf-8');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Not Found');
  });
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  const siteDir = path.join(process.cwd(), '_site');
  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createStaticServer(siteDir);
  server.listen(port, host, () => {
    console.log(`Static site server listening at http://${host}:${port}`);
  });
}
