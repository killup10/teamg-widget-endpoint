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
  '.svg': 'image/svg+xml'
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
  const pathname = parsedUrl.pathname;

  // If the root is requested, serve the MSX JSON manifest.
  if (pathname === '/') {
    const widgetJson = createWidgetJson();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(widgetJson, null, 2));
    return;
  }

  // For all other requests, try to serve a static file from the 'public' directory.
  const filePath = path.join(__dirname, 'public', pathname);

  fs.exists(filePath, (exist) => {
    if (!exist) {
      // If the file doesn't exist, return 404 Not Found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // If path is a directory, deny access for security reasons
    if (fs.statSync(filePath).isDirectory()) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden - Directory listing not allowed.');
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
  console.log(`Serving MSX JSON from root and static files from /public`);
});
