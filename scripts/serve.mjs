import fs from 'node:fs';
import http from 'node:http';
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

function sendPlain(res, method, statusCode, text, extraHeaders = {}) {
  if (res.headersSent) return;
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(method === 'HEAD' ? undefined : text);
}

async function statSafe(filePath) {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}

async function realpathSafe(filePath) {
  try {
    return await fs.promises.realpath(filePath);
  } catch {
    return null;
  }
}

function isWithinRoot(targetReal, rootReal) {
  return Boolean(
    targetReal && (targetReal === rootReal || targetReal.startsWith(rootReal + path.sep))
  );
}

export function createStaticServer(siteDir) {
  const resolvedSiteDir = path.resolve(siteDir);
  let resolvedSiteReal;
  try {
    resolvedSiteReal = fs.realpathSync(resolvedSiteDir);
  } catch {
    resolvedSiteReal = resolvedSiteDir;
  }

  const sendFile = async (req, res, statusCode, filePath, stat, contentType) => {
    const fileReal = await realpathSafe(filePath);
    if (!isWithinRoot(fileReal, resolvedSiteReal)) {
      sendPlain(res, req.method, 403, 'Forbidden');
      return;
    }

    res.writeHead(statusCode, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(fileReal);
    const cleanupStream = () => {
      if (!stream.destroyed) stream.destroy();
    };
    res.once('close', cleanupStream);
    stream.on('error', () => {
      cleanupStream();
      if (!res.headersSent) {
        sendPlain(res, req.method, 500, 'Internal Server Error');
      } else if (!res.destroyed) {
        res.destroy();
      }
    });
    stream.pipe(res);
  };

  const handleRequest = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendPlain(res, req.method, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }

    const rawUrl = req.url || '/';
    if (rawUrl.startsWith('//')) {
      sendPlain(res, req.method, 400, 'Bad Request');
      return;
    }

    let cleanPath;
    let search = '';
    let escapesRoot = false;
    try {
      const reqUrl = new URL(rawUrl, 'http://127.0.0.1');
      if (reqUrl.origin !== 'http://127.0.0.1') {
        sendPlain(res, req.method, 400, 'Bad Request');
        return;
      }
      const rawPathname = decodeURIComponent(rawUrl.split(/[?#]/)[0]);
      let depth = 0;
      for (const segment of rawPathname.replaceAll('\\', '/').split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
          depth -= 1;
          if (depth < 0) {
            escapesRoot = true;
            break;
          }
        } else {
          depth += 1;
        }
      }
      cleanPath = decodeURIComponent(reqUrl.pathname);
      search = reqUrl.search;
    } catch {
      sendPlain(res, req.method, 400, 'Bad Request');
      return;
    }

    if (escapesRoot) {
      sendPlain(res, req.method, 403, 'Forbidden');
      return;
    }

    if (/[\r\n\0]/.test(cleanPath) || /[\r\n\0]/.test(search) || cleanPath.startsWith('//')) {
      sendPlain(res, req.method, 400, 'Bad Request');
      return;
    }

    let candidatePath = path.resolve(resolvedSiteDir, `.${cleanPath}`);
    if (!isWithinRoot(candidatePath, resolvedSiteDir)) {
      sendPlain(res, req.method, 403, 'Forbidden');
      return;
    }

    const candidateReal = await realpathSafe(candidatePath);
    if (candidateReal && !isWithinRoot(candidateReal, resolvedSiteReal)) {
      sendPlain(res, req.method, 403, 'Forbidden');
      return;
    }

    let stat = candidateReal ? await statSafe(candidateReal) : await statSafe(candidatePath);
    if (stat?.isDirectory()) {
      if (cleanPath !== '/' && !cleanPath.endsWith('/')) {
        res.writeHead(301, {
          Location: `${cleanPath}/${search}`,
          'X-Content-Type-Options': 'nosniff',
        });
        res.end();
        return;
      }
      candidatePath = path.join(candidatePath, 'index.html');
      const indexReal = await realpathSafe(candidatePath);
      if (indexReal && !isWithinRoot(indexReal, resolvedSiteReal)) {
        sendPlain(res, req.method, 403, 'Forbidden');
        return;
      }
      stat = indexReal ? await statSafe(indexReal) : await statSafe(candidatePath);
    }

    if (stat?.isFile()) {
      const ext = path.extname(candidatePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      await sendFile(req, res, 200, candidatePath, stat, contentType);
      return;
    }

    const notFoundPath = path.join(resolvedSiteDir, '404.html');
    const notFoundStat = await statSafe(notFoundPath);
    if (notFoundStat?.isFile()) {
      await sendFile(req, res, 404, notFoundPath, notFoundStat, 'text/html; charset=utf-8');
      return;
    }

    sendPlain(res, req.method, 404, 'Not Found');
  };

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error(`Request handler failure for ${req.url}: ${err.message}`);
      if (!res.headersSent) {
        sendPlain(res, req.method, 500, 'Internal Server Error');
      } else if (!res.destroyed) {
        res.destroy();
      }
    });
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  return server;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  const siteDir = path.join(process.cwd(), '_site');
  if (!fs.existsSync(siteDir)) {
    console.error('Error: _site/ directory does not exist. Run "npm run build" first.');
    process.exit(1);
  }

  const rawPort = process.env.PORT ?? '4000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`Error: Invalid PORT "${rawPort}". Must be an integer between 0 and 65535.`);
    process.exit(1);
  }

  const host = process.env.HOST || '127.0.0.1';
  const server = createStaticServer(siteDir);

  server.on('error', (err) => {
    console.error(`Failed to start static server on ${host}:${port}: ${err.message}`);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`Static site server listening at http://${host}:${actualPort}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}; shutting down static server...`);
    server.closeAllConnections?.();
    const timer = setTimeout(() => process.exit(0), 3000);
    timer.unref?.();
    server.close(() => {
      clearTimeout(timer);
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
