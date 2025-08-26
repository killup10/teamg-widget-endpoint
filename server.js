const http = require('http');

const widgetJson = {
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
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Serve JSON for all requests
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  });
  
  res.end(JSON.stringify(widgetJson, null, 2));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
  console.log(`Serving widget JSON for LG NetCast`);
});
