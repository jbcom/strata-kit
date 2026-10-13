import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = dirname(directory);
const require = createRequire(import.meta.url);
const threeRoot = dirname(dirname(require.resolve('three')));

function galleryFile(path) {
  if (path === '/' || path === '/index.html') return join(directory, 'gallery.html');
  if (path === '/gallery.mjs') return join(directory, 'gallery.mjs');
  if (/^\/lib\/[a-z0-9-]+\.js$/.test(path)) return join(root, 'dist', path.slice(5));
  if (path === '/vendor/three.module.js' || path === '/vendor/three.core.js')
    return join(threeRoot, 'build', path.slice(8));
  if (path === '/addons/controls/OrbitControls.js' || path === '/addons/environments/RoomEnvironment.js')
    return join(threeRoot, 'examples', 'jsm', path.slice(8));
}

/** Serve only the runnable gallery and its explicit built dependencies. */
export async function startGalleryServer({ port = 0, host = '127.0.0.1', snapshot = false } = {}) {
  const snapshots = new Map();
  const servedHashes = {};
  if (snapshot) {
    const paths = ['/', '/index.html', '/gallery.mjs', '/vendor/three.module.js',
      '/vendor/three.core.js', '/addons/controls/OrbitControls.js', '/addons/environments/RoomEnvironment.js'];
    for (const name of await readdir(join(root, 'dist')))
      if (name.endsWith('.js')) paths.push(`/lib/${name}`);
    for (const path of paths) {
      const bytes = await readFile(galleryFile(path));
      snapshots.set(path, bytes);
      servedHashes[path] = createHash('sha256').update(bytes).digest('hex');
    }
  }
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = galleryFile(path);
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const bytes = snapshot ? snapshots.get(path) : await readFile(file);
      if (!bytes) throw new Error('Asset is not part of the gallery snapshot');
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
  return { server, servedHashes, url: `http://${host}:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gallery = await startGalleryServer({ port: Number(process.env.PORT ?? 4400) });
  console.log(`Strata Procedural gallery: ${gallery.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await gallery.close(); process.exit(0); });
}
