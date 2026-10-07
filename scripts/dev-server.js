/** Servidor local sin caché, limitado a los recursos públicos del proyecto. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');

function createDevServer(root = projectRoot) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const publicPaths = new Set(['/index.html', '/sw.js', '/js/audio-level-processor.js']);
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!/^(https?:|#)/.test(reference)) publicPaths.add(`/${reference.split('?')[0]}`);
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

  return http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405); response.end(); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch (_) { response.writeHead(400); response.end(); return; }
    if (pathname === '/_dev/status') {
      // La página se lee en cada petición: el diagnóstico debe reflejarla también.
      const version = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/\?v=(\d+)/)?.[1];
      let config = '';
      try { config = fs.readFileSync(path.join(root, 'js/config.local.js'), 'utf8'); }
      catch (error) {
        // Una copia limpia (incluido CI) no contiene la configuración local ignorada.
        if (error.code !== 'ENOENT') { response.writeHead(500); response.end(); return; }
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      const currentVersion = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/\?v=(\d+)/)?.[1] || version;
      response.end(JSON.stringify({ version: currentVersion, root,
        configured: config.includes('SUPABASE_URL') && config.includes('SUPABASE_ANON_KEY')
          && !/TU-PROYECTO|TU_ANON_KEY_AQUI/.test(config) }));
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    if (!publicPaths.has(pathname)) { response.writeHead(404); response.end(); return; }
    const file = path.join(root, pathname);
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error('No es un recurso público');
      response.setHeader('Content-Type', `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`);
      response.setHeader('Content-Length', stat.size);
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = fs.createReadStream(file);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch (_) { response.writeHead(404); response.end(); }
  });
}

function openBrowser(url) {
  // Las URLs las construye este servidor; no se interpola entrada libre en PowerShell.
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+\/(?:\?dev=\d+)?$/.test(url)) {
    return Promise.reject(new Error('URL local inválida'));
  }
  let command, args;
  if (process.env.WSL_DISTRO_NAME || process.platform === 'win32') {
    command = 'powershell.exe'; args = ['-NoProfile', '-Command', `Start-Process '${url}'`];
  } else if (process.platform === 'darwin') {
    command = 'open'; args = [url];
  } else {
    command = 'xdg-open'; args = [url];
  }
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => error ? reject(error) : resolve());
  });
}

if (require.main === module) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('El puerto debe estar entre 1 y 65535.'); process.exit(1);
  }
  const server = createDevServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `Puerto ${port} ocupado. No se detiene ningún proceso; usa --port con otro puerto.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', async () => {
    const version = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8').match(/\?v=(\d+)/)[1];
    const url = `http://localhost:${port}/?dev=${version}`;
    console.log(`AcoustiMap v${version}: ${url}\nRaíz: ${projectRoot}\nCaché HTTP desactivada.`);
    if (!process.argv.includes('--no-open')) {
      try { await openBrowser(url); console.log('Navegador abierto con la versión actual.'); }
      catch (error) { console.warn(`No se pudo abrir el navegador: ${error.message}. Abre ${url}`); }
    }
  });
}

module.exports = { createDevServer, openBrowser };
