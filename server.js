const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Función que crea el JSON dinámico para Media Station X
const createWidgetJson = () => ({
  "version": "1.0.0",
  "id": "com.teamg.play.netcast",
  "name": "TeamG Play TV",
  "description": "TeamG Play optimizado para LG NetCast vía Media Station X.",
  "icon": "http://teamgplay.online/TeamG%20Play.png",
  "homepage": "http://teamgplay.online/index.html",
  "app": {
    "type": "web",
    "title": "TeamG Play TV",
    "url": "http://teamgplay.online/index.html",
    "icon": "http://teamgplay.online/TeamG%20Play.png"
  },
  "startup": {
    "url": "http://teamgplay.online/index.html"
  },
  "meta": {
    "platform": "LG NetCast",
    "via": "Media Station X",
    "maintainer": "TeamG",
    "timestamp": new Date().toISOString()
  }
});

// Mapeo de tipos de archivo para servir contenido estático
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
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

  // *** LÓGICA CORREGIDA ***
  // Si Media Station X pide la raíz del dominio ('/'), le damos el JSON.
  if (pathname === '/') {
    const widgetJson = createWidgetJson();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(widgetJson, null, 2));
    return;
  }

  // Para cualquier otra petición (ej. /index.html, /TeamG Play.png),
  // intentamos servir un archivo desde la carpeta 'public'.
  const filePath = path.join(__dirname, 'public', pathname);

  fs.exists(filePath, (exist) => {
    if (!exist) {
      // Si el archivo no existe, devolvemos 404 Not Found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      } else {
        const ext = path.parse(filePath).ext;
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});
