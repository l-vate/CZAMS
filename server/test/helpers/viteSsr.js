// A Vite server for tests that load client files (JSX) through ssrLoadModule. It must be started like this and nothing else:
//   - optimizeDeps.noDiscovery: with the default settings Vite starts scanning and bundling the app's dependencies in a native background
//     thread as soon as it starts. A test file that ends while that scan is still running crashes Node itself (a segmentation fault, which
//     the test runner only reports as "test failed"). ssrLoadModule never needs the optimized copies, so the scan is switched off.
//   - its own cacheDir: it never shares node_modules/.vite with a dev server running at the same time, so the two cannot disturb each other.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..', '..');
const fromRoot = createRequire(path.join(root, 'package.json'));

async function startSsrServer() {
  const { createServer } = await import(pathToFileURL(fromRoot.resolve('vite')).href);
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'czams-vite-test-'));
  const vite = await createServer({
    root,
    cacheDir,
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const close = async () => {
    await vite.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  };
  return { vite, close, root };
}

module.exports = { startSsrServer };
