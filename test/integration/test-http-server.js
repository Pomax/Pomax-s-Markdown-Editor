/**
 * @fileoverview Shared HTTP server for integration tests.
 * Serves files from the src/ directory over localhost on an ephemeral port.
 * The root URL serves src/web/index.html.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(path.join(__dirname, `../../src`));
const STATIC_DIR = path.join(SRC_DIR, `web`);

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
  '.html': `text/html`,
  '.js': `application/javascript`,
  '.css': `text/css`,
};

/**
 * Starts an HTTP server that serves files from the src/ directory.
 * @param {number} [PORT=0] - Port to listen on (0 = ephemeral).
 * @returns {Promise<{ server: import('node:http').Server, baseURL: string }>}
 */
export async function startServer(PORT = 0) {
  const server = createServer(async (req, res) => {
    let urlPath = new URL(req.url ?? `/`, `http://localhost`).pathname;

    if (urlPath === `/`) urlPath = `/web/index.html`;

    if (urlPath.includes(`/src/parsers`)) {
      urlPath = urlPath.replace(`/src`, ``);
    }

    let filePath = path.resolve(path.join(SRC_DIR, urlPath));
    if (!existsSync(filePath)) {
      filePath = path.resolve(path.join(STATIC_DIR, urlPath));
      if (!existsSync(filePath)) {
        res.writeHead(403);
        res.end(`Forbidden`);
        return;
      }
    }

    try {
      const content = readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[ext] || `application/octet-stream`,
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end(`Not Found`);
    }
  });

  await new Promise((resolve) => server.listen(PORT, /** @type {() => void} */ (resolve)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  const baseURL = `http://localhost:${addr.port}`;
  return { server, baseURL };
}

/**
 * Stops a running HTTP server.
 * @param {import('node:http').Server} server
 */
export async function stopServer(server) {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
