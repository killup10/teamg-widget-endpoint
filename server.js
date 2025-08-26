const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Function to create the dynamic JSON for Media Station X
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

// MIME type mapping
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;

  // Route for the MSX JSON manifest
  if (pathname === '/') {
    const widgetJson = createWidgetJson();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(widgetJson, null, 2));
    return;
  }

  // Logic for serving static files from the 'public' directory
  let filePath = path.join(__dirname, 'public', pathname);

  fs.exists(filePath, (exist) => {
    if (!exist) {
      // If file doesn't exist, return 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // If it's a directory, try to serve index.html from it
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // Read file and serve
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
  console.log(`Serving MSX JSON from root and static files from /public`);
});
