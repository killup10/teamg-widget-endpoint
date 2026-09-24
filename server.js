const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Base URL dinámica: usa el Host real (Render/Railway/dominio propio).
// Así no queda hardcodeado teamgplay.online y funciona con ott.teamg.store,
// widget.teamg.store o el dominio .onrender.com. Siempre http para NetCast.
const getHost = (req) => {
  const fwd = req.headers['x-forwarded-host'];
  const host = (Array.isArray(fwd) ? fwd[0] : fwd) || req.headers.host || ('localhost:' + PORT);
  return String(host).split(',')[0].trim();
};
const baseOf = (req) => 'http://' + getHost(req);

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
  return {
    "version": "1.0.0",
    "id": "com.ott.clone.tv",
    "name": "OTT TV",
    "description": "OTT TV - réplica estilo OTTPlayer: carga tu M3U, grupos, favoritos y ocultos.",
    "icon": base + "/ott/icon.png",
    "homepage": base + "/ott/index.html",
    "app": {
      "type": "web",
      "title": "OTT TV",
      "url": base + "/ott/index.html",
      "icon": base + "/ott/icon.png"
    },
    "startup": {
      "url": base + "/ott/index.html"
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
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });
};

const server = http.createServer((req, res) => {
  // Configurar cabeceras CORS para todas las respuestas
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Manejar peticiones pre-vuelo (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

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
  // APP 1: TeamG Play (se mantiene intacta).
  if (pathname === '/') {
    const widgetJson = createWidgetJson(req);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(widgetJson, null, 2));
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
