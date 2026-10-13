import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = dirname(directory);
const require = createRequire(import.meta.url);
const threeRoot = dirname(dirname(require.resolve('three')));

/** Serve only the runnable gallery and its explicit built dependencies. */
export async function startGalleryServer({ port = 0, host = '127.0.0.1' } = {}) {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    let file;
    if (path === '/' || path === '/index.html') file = join(directory, 'gallery.html');
    else if (path === '/gallery.mjs') file = join(directory, 'gallery.mjs');
    else if (/^\/lib\/[a-z-]+\.js$/.test(path)) file = join(root, 'dist', path.slice(5));
    else if (path === '/vendor/three.module.js' || path === '/vendor/three.core.js') {
      file = join(threeRoot, 'build', path.slice(8));
    } else if (path === '/addons/controls/OrbitControls.js' || path === '/addons/environments/RoomEnvironment.js') {
      file = join(threeRoot, 'examples', 'jsm', path.slice(8));
    }
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end('Build the package before opening the gallery.');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return { server, url: `http://${host}:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gallery = await startGalleryServer({ port: Number(process.env.PORT ?? 4400) });
  console.log(`Strata Procedural gallery: ${gallery.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await gallery.close(); process.exit(0); });
}
