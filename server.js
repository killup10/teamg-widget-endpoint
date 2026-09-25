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
    "icon": base + "/ott/icon.png",
    "homepage": appUrl,
    "app": {
      "type": "web",
      "title": "OTT TV",
      "url": appUrl,
      "icon": base + "/ott/icon.png"
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

const serveFile = (filePath, res) => {
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      } else {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(data);
      }
    });
  });
};

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
  console.log('[REQ]', req.method, getHost(req) + (req.url || '/'));

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
      "headline": "OTT TV v2.4.8 [Control Tradicional, Buscador 🔍, Aspecto Real y Subtítulos MKV]",
      "template": { "type": "default", "layout": "0,0,3,2", "imageFiller": "width-center" },
      "items": [
        {
          "title": "Abrir OTT TV",
          "description": "Carga tu lista M3U y mira tus canales",
          "image": base + "/ott/icon.png",
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

  // APP 2: OTT TV (nueva, separada de TeamG). Start Parameter en MSX:
  //   ott.teamg.store/ott   o   widget.teamg.store/ott
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

  // *** LÓGICA CORREGIDA ***
  // Si Media Station X pide la raíz del dominio ('/'), le damos el JSON.
  // El teclado de MSX en TVs viejas no tiene "/", así que no se puede
  // escribir "dominio/ott": el dominio ott.* responde la APP 2 en raíz.
  // APP 1 TeamG en el resto de hosts (se mantiene intacta).
  if (pathname === '/') {
    const hostOnly = getHost(req).split(':')[0].toLowerCase();
    const ottJson = hostOnly === 'ott.teamg.store' || hostOnly.indexOf('ott.') === 0
      ? createOttJson(req)
      : createWidgetJson(req);
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
  console.log(`HTTP server running on port ${PORT}`);
});
