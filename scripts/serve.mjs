import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function createStaticServer(siteDir) {
  const resolvedSiteDir = path.resolve(siteDir);

  return http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const cleanPath = decodeURIComponent(reqUrl.pathname);

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
      candidatePath = path.join(candidatePath, 'index.html');
    }

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      const ext = path.extname(candidatePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(candidatePath).pipe(res);
      return;
    }

    const notFoundPath = path.join(resolvedSiteDir, '404.html');
    if (fs.existsSync(notFoundPath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(notFoundPath).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const siteDir = path.join(process.cwd(), '_site');
  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createStaticServer(siteDir);
  server.listen(port, host, () => {
    console.log(`Static site server listening at http://${host}:${port}`);
  });
}
