const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const ottApi = require('./ott-api');

const PORT = process.env.PORT || 3000;

// Base URL dinámica: usa el Host real (Render/Railway/dominio propio).
// Base URL dinámica: usa el Host real y el protocolo HTTPS (Render/Cloudflare).
// De esta forma los JSON de Media Station X y los enlaces de la app no generan
// contenido mixto ni rebotes 301.
const getHost = (req) => {
  const fwd = req.headers['x-forwarded-host'];
  const host = (Array.isArray(fwd) ? fwd[0] : fwd) || req.headers.host || ('localhost:' + PORT);
  return String(host).split(',')[0].trim();
};
const getProto = (req) => {
  const fwd = req.headers['x-forwarded-proto'];
  const p = (Array.isArray(fwd) ? fwd[0] : fwd) || '';
  if (p) return p.split(',')[0].trim().toLowerCase();
  if (req.headers['cf-visitor']) {
    try {
      const v = JSON.parse(req.headers['cf-visitor']);
      if (v && v.scheme) return v.scheme.toLowerCase();
    } catch (e) {}
  }
  return (req.connection && req.connection.encrypted) ? 'https' : 'http';
};
const baseOf = (req) => getProto(req) + '://' + getHost(req);

// Caché en RAM de carátulas para que la TV abra carpetas a 0ms sin lag
const ottImgCache = new Map();
const MAX_OTT_IMG_CACHE = 200;

// Función que crea el JSON dinámico para Media Station X
// APP 1 (existente, no tocar IDs): TeamG Play en /
const createWidgetJson = (req) => {
  const base = baseOf(req);
  return {
  "version": "1.0.0",
  "id": "com.teamg.play.netcast",
  "name": "TeamG Play TV",
  "description": "TeamG Play optimizado para LG NetCast vía Media Station X.",
  "icon": base + "/TeamG%20Play.png",
  "homepage": base + "/index.html",
  "app": {
    "type": "web",
    "title": "TeamG Play TV",
    "url": base + "/index.html",
    "icon": base + "/TeamG%20Play.png"
  },
  "startup": {
    "url": base + "/index.html"
  },
  "meta": {
    "platform": "LG NetCast",
    "via": "Media Station X",
    "maintainer": "TeamG",
    "timestamp": new Date().toISOString()
  }
  };
};

// APP 2 (nueva, separada): OTT TV clon estilo OTTPlayer en /ott
const createOttJson = (req) => {
  const base = baseOf(req);
  const vStamp = '2.5.0';
  const appUrl = base + '/ott/index.html?v=' + Date.now();
  return {
    "version": vStamp,
    "id": "com.ott.clone.tv",
    "name": "OTT TV",
    "description": "OTT TV - réplica estilo OTTPlayer: Series Hub, detección M3U inteligente y drawer fluido.",
    "icon": base + "/ott/logo-teamg.png",
    "homepage": appUrl,
    "app": {
      "type": "web",
      "title": "OTT TV",
      "url": appUrl,
      "icon": base + "/ott/logo-teamg.png"
    },
    "startup": {
      "url": appUrl
    },
    "meta": {
      "platform": "LG NetCast / Samsung Tizen / WebOS",
      "via": "Media Station X",
      "maintainer": "TeamG",
      "timestamp": new Date().toISOString()
    }
  };
};

// Mapeo de tipos de archivo para servir contenido estático
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.m3u': 'audio/x-mpegurl',
  '.m3u8': 'application/vnd.apple.mpegurl'
};

const serveStatic = require('./static-files');
const serveFile = (filePath, res) => serveStatic(filePath, res.req, res, mimeTypes);

const server = http.createServer((req, res) => {
  // Configurar cabeceras CORS para todas las respuestas
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Range, x-admin-key, User-Agent');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  // Manejar peticiones pre-vuelo (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let pathname = '/';
  let query = {};
  try {
    const u = new URL(req.url || '/', 'http://x');
    pathname = u.pathname || '/';
    query = Object.fromEntries(u.searchParams);
  } catch (e) { pathname = '/'; }
  // Record payload bytes without query strings (which can contain credentials).
  let sentBytes = 0;
  const write = res.write;
  const end = res.end;
  const count = (chunk, encoding) => {
    if (chunk != null && typeof chunk !== 'function') sentBytes += Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk)
      ? chunk.byteLength : Buffer.byteLength(String(chunk), typeof encoding === 'string' ? encoding : undefined);
  };
  res.write = function(chunk, encoding, callback) { count(chunk, encoding); return write.call(this, chunk, encoding, callback); };
  res.end = function(chunk, encoding, callback) { count(chunk, encoding); return end.call(this, chunk, encoding, callback); };
  res.once('close', () => console.log('[BANDWIDTH]', JSON.stringify({
    method: req.method, path: pathname.replace(/\/android-audio\/[a-f0-9]{48}/, '/android-audio/:session'),
    status: res.statusCode, bytes: sentBytes, complete: res.writableFinished
  })));

  // Health check / ping para keep-alive
  if (pathname === '/ping' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('pong');
  }

  // Favicon: responde el icono para no ensuciar logs con 404.
  if (pathname === '/favicon.ico') {
    return serveFile(path.join(__dirname, 'ott', 'icon.png'), res);
  }

  // Stream Proxy para Smart TVs (LG NetCast / Samsung): convierte flujos HTTPS/TLS 1.3 a HTTP puerto 80
  if (pathname.indexOf('/api/ott/android-audio/') === 0 && (req.method === 'GET' || req.method === 'HEAD')) {
    return require('./android-audio').serve(req, res, pathname);
  }
  if (pathname === '/api/ott/music/debug') {
    const { execFile, execFileSync } = require('child_process');
    const { getYtDlpPath, ensureYtDlp } = require('./scripts/ensure-yt-dlp');
    return (async () => {
      const logs = {};
      const bin = getYtDlpPath();
      logs.binPath = bin;
      logs.binExists = fs.existsSync(bin);
      if (fs.existsSync('./bin')) {
        logs.binDirContents = fs.readdirSync('./bin');
      } else {
        logs.binDirContents = 'no ./bin directory';
      }
      try {
        logs.platform = process.platform;
        logs.arch = process.arch;
      } catch (e) {}

      if (!logs.binExists) {
        try {
          const fresh = await ensureYtDlp();
          logs.ensured = fresh;
          logs.freshExists = fs.existsSync(fresh);
        } catch (e) {
          logs.ensureErr = e.message;
        }
      }

      const activeBin = fs.existsSync(bin) ? bin : (logs.ensured && fs.existsSync(logs.ensured) ? logs.ensured : null);
      if (activeBin) {
        try {
          logs.version = execFileSync(activeBin, ['--version'], { encoding: 'utf8', timeout: 30000 }).trim();
        } catch (e) {
          logs.verErr = e.message;
        }
        logs.nodePath = process.execPath;
        // Probar varios clientes de YouTube desde la IP del servidor (?clients=a,b,c).
        const clientList = String(query.clients || 'default').split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
        const cookieArgs = require('./ott-music').ytDlpCookieArgs();
        logs.cookiesConfigured = cookieArgs.length > 0;
        if (fs.existsSync('/tmp/teamg-yt-cookies.txt')) {
          const stats = fs.statSync('/tmp/teamg-yt-cookies.txt');
          const sample = fs.readFileSync('/tmp/teamg-yt-cookies.txt', 'utf8').substring(0, 150);
          logs.cookieFile = { size: stats.size, sample: sample.replace(/\t/g, '[TAB]').replace(/\r?\n/g, '[NL]') };
        }
        logs.execTests = {};
        for (const client of clientList) {
          try {
            logs.execTests[client] = await new Promise(r => {
              const testArgs = ['--verbose', '--js-runtimes', 'node:' + process.execPath, '-g', '-f', '140/bestaudio[ext=m4a]/ba/b/best', '--no-playlist'];
              if (client !== 'default') {
                testArgs.push('--extractor-args', 'youtube:player_client=' + client);
              }
              execFile(activeBin, testArgs.concat(cookieArgs, ['https://www.youtube.com/watch?v=zokUHAyGh2Y']), { timeout: 25000 }, (err, stdout, stderr) => {
                r({ ok: !err && !!stdout && stdout.indexOf('http') === 0, url: stdout ? stdout.substring(0, 60) : null, err: err ? err.message : null, stderr: stderr ? stderr.substring(0, 1000) : null });
              });
            });
          } catch (e) {
            logs.execTests[client] = { ok: false, stderr: e.message };
          }
        }
        try {
          logs.execTests['nocookies'] = await new Promise(r => {
            const testArgs = ['--js-runtimes', 'node:' + process.execPath, '-g', '-f', '140/bestaudio[ext=m4a]/ba/b/best', '--no-warnings', '--no-playlist', 'https://www.youtube.com/watch?v=zokUHAyGh2Y'];
            execFile(activeBin, testArgs, { timeout: 25000 }, (err, stdout, stderr) => {
              r({ ok: !err && !!stdout && stdout.indexOf('http') === 0, url: stdout ? stdout.substring(0, 60) : null, err: err ? err.message : null, stderr: stderr ? stderr.substring(0, 200) : null });
            });
          });
        } catch (e) {
          logs.execTests['nocookies'] = { ok: false, stderr: e.message };
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(logs, null, 2));
    })();
  }
  if (pathname.indexOf('/api/ott/music/lyrics') === 0) {
    return require('./ott-music').handleMusicLyrics(req, res, pathname, query);
  }
  if (pathname.indexOf('/api/ott/music/resolve') === 0) {
    return require('./ott-music').handleMusicResolve(req, res, query);
  }
  if (pathname.indexOf('/api/ott/music/stream') === 0 || pathname.indexOf('/api/ott/music/radio') === 0) {
    return require('./ott-music').handleMusicStream(req, res, pathname, query);
  }
  if (pathname === '/api/ott/img') {
    const target = String(query.url || '').trim();
    if (!/^https?:\/\//i.test(target)) {
      res.writeHead(400); return res.end();
    }
    if (ottImgCache.has(target)) {
      const hit = ottImgCache.get(target);
      res.writeHead(200, {
        'Content-Type': hit.contentType || 'image/jpeg',
        'Content-Length': String(hit.buffer.length),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800'
      });
      return res.end(hit.buffer);
    }
    const client = target.startsWith('https') ? require('https') : require('http');
    const proxyReq = client.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 }, (imgRes) => {
      if (imgRes.statusCode >= 300 && imgRes.statusCode < 400 && imgRes.headers.location) {
        res.writeHead(imgRes.statusCode, { Location: imgRes.headers.location, 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }
      const chunks = [];
      imgRes.on('data', c => chunks.push(c));
      imgRes.on('end', () => {
        const buf = Buffer.concat(chunks);
        const cType = imgRes.headers['content-type'] || 'image/jpeg';
        if (imgRes.statusCode === 200 && buf.length > 0) {
          if (ottImgCache.size >= MAX_OTT_IMG_CACHE) {
            const oldest = ottImgCache.keys().next().value;
            ottImgCache.delete(oldest);
          }
          ottImgCache.set(target, { buffer: buf, contentType: cType });
        }
        res.writeHead(imgRes.statusCode || 200, {
          'Content-Type': cType,
          'Content-Length': String(buf.length),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=604800'
        });
        res.end(buf);
      });
    });
    proxyReq.on('error', () => { if (!res.headersSent) { res.writeHead(404); res.end(); } });
    return;
  }
  if (pathname.indexOf('/api/ott/stream') === 0) {
    return ottApi.handleStream(req, res, query);
  }

  // API OTT (login, dispositivos, feed, admin). Cuerpo JSON hasta 15MB.
  if (pathname.indexOf('/api/ott/') === 0) {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 15728640) req.destroy(); });
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (e) { body = {}; }
      ottApi.handle(req, res, pathname, query, body).catch((err) => {
        console.error('API Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
      });
    });
    return;
  }

  // Panel admin en /admin (archivos de ./admin).
  if (pathname === '/admin' || pathname === '/admin/') {
    return serveFile(path.join(__dirname, 'admin', 'index.html'), res);
  }
  if (pathname === '/web' || pathname === '/web/') {
    return serveFile(path.join(__dirname, 'web', 'index.html'), res);
  }
  if (pathname.indexOf('/web/') === 0) {
    const relW = path.normalize(decodeURIComponent(pathname).replace(/^\/web\//, '')).replace(/^(\.\.(\/|\\|$))+/, '');
    return serveFile(path.join(__dirname, 'web', relW || 'index.html'), res);
  }
  if (pathname.indexOf('/admin/') === 0) {
    const relA = path.normalize(decodeURIComponent(pathname).replace(/^\/admin\//, '')).replace(/^(\.\.(\/|\\|$))+/, '');
    return serveFile(path.join(__dirname, 'admin', relA), res);
  }

  // MSX pide /msx/start.json cuando el Start Parameter es solo un host
  // (ej. "ott.teamg.store"). Según wiki MSX debe ser un Start Object con
  // name + version + parameter (menu:/content:). Sin "name" da el error
  // "Missing start parameter name."
  if (pathname === '/msx/start.json') {
    const base = baseOf(req);
    const hostOnly = getHost(req).split(':')[0].toLowerCase();
    const isOtt = hostOnly === 'ott.teamg.store' || hostOnly.indexOf('ott.') === 0;
    const startJson = isOtt
      ? {
          "name": "OTT TV",
          "version": "2.5.0",
          "parameter": "content:" + base + "/msx/ott.json?v=" + Date.now()
        }
      : {
          "name": "TeamG Play TV",
          "version": "1.0.0",
          "parameter": "content:" + base + "/msx/teamg.json"
        };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(startJson, null, 2));
    return;
  }

  // Contenido MSX de la APP 2: item que abre la app OTT en ventana.
  if (pathname === '/msx/ott.json') {
    const base = baseOf(req);
    const ottContent = {
      "type": "list",
      "headline": "TeamG Play",
      "template": { "type": "default", "layout": "0,0,3,2", "imageFiller": "fit" },
      "items": [
        {
          "title": "Abrir TeamG Play",
          "image": base + "/ott/logo-teamg.png?v=2.5.55",
          "action": "link:" + base + "/ott/index.html?v=" + Date.now()
        }
      ]
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(ottContent, null, 2));
    return;
  }

  // Contenido MSX de la APP 1 (TeamG, intacta).
  if (pathname === '/msx/teamg.json') {
    const base = baseOf(req);
    const teamgContent = {
      "type": "list",
      "headline": "TeamG Play",
      "template": { "type": "default", "layout": "0,0,3,2", "imageFiller": "width-center" },
      "items": [
        {
          "title": "Abrir TeamG Play",
          "description": "Abrir TeamG Play TV",
          "image": base + "/TeamG%20Play.png",
          "action": "link:" + base + "/index.html"
        }
      ]
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(teamgContent, null, 2));
    return;
  }

  // Detección de navegador web (Chrome, Edge, Firefox, PC / móvil)
  const acceptHeader = (req.headers.accept || '').toLowerCase();
  const isBrowserHtml = acceptHeader.indexOf('text/html') !== -1;

  // APP 2: Si un navegador web solicita /ott o /, le entregamos la aplicación HTML directamente
  // para que pueda probarse en PC sin necesidad de escribir la ruta larga index.html
  if (isBrowserHtml && (pathname === '/ott' || pathname === '/ott/')) {
    const filePath = path.join(__dirname, 'ott', 'index.html');
    return serveFile(filePath, res);
  }

  if (pathname === '/ott' || pathname === '/ott/' || pathname === '/ott.json') {
    const ottJson = createOttJson(req);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(ottJson, null, 2));
    return;
  }

  // Archivos de la APP 2: /ott/* -> ./ott/*
  if (pathname === '/ott/index.html' || pathname.indexOf('/ott/') === 0) {
    const rel = pathname.replace(/^\/ott\//, '').replace(/^\/ott$/, 'index.html') || 'index.html';
    const safeRel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(__dirname, 'ott', safeRel);
    return serveFile(filePath, res);
  }

  // *** LÓGICA DE RAÍZ ('/') ***
  // Si un navegador web entra a ott.teamg.store/, le servimos la app web directamente
  if (pathname === '/') {
    const hostOnly = getHost(req).split(':')[0].toLowerCase();
    const isOttHost = hostOnly === 'ott.teamg.store' || hostOnly.indexOf('ott.') === 0;

    if (isBrowserHtml && isOttHost) {
      const filePath = path.join(__dirname, 'ott', 'index.html');
      return serveFile(filePath, res);
    }

    const ottJson = isOttHost ? createOttJson(req) : createWidgetJson(req);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(ottJson, null, 2));
    return;
  }

  // Para cualquier otra petición (ej. /index.html, /TeamG Play.png),
  // intentamos servir un archivo desde la carpeta 'public' (APP 1).
  // Se normaliza y se bloquea path traversal.
  const relPublic = decodeURIComponent(pathname).replace(/^\/+/, '');
  const safePublic = path.normalize(relPublic).replace(/^(\.\.(\/|\\|$))+/, '');
  return serveFile(path.join(__dirname, 'public', safePublic), res);
});

server.listen(PORT, () => {
  console.log('HTTP server running on port ' + PORT);
  try {
    const { ensureYtDlp } = require('./scripts/ensure-yt-dlp');
    ensureYtDlp().catch((e) => console.warn('[yt-dlp] Init warning:', e.message));
  } catch (_) {}
});
