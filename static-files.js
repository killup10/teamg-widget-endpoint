'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const gzip = promisify(zlib.gzip);
const compressed = new Map();

module.exports = async function serveStatic(filePath, req, res, mimeTypes) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) { res.writeHead(404); return res.end('Not Found'); }
    const ext = path.extname(filePath).toLowerCase();
    const compressible = /\.(html|js|css|json|svg)$/.test(ext);
    const useGzip = compressible && /\bgzip\b(?!\s*;\s*q=0(?:\.0*)?(?:\s*,|\s*$))/i.test(req.headers['accept-encoding'] || '');
    const etag = 'W/"' + stat.size + '-' + stat.mtimeMs + '"';
    const headers = {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      // Revalidate documents; versioned assets can be reused without a download.
      'Cache-Control': /\.(m3u|m3u8)$/.test(ext) ? 'no-store'
        : ext === '.html' || ext === '.json' ? 'public, no-cache' : 'public, max-age=86400',
      'ETag': etag,
      'Last-Modified': stat.mtime.toUTCString(),
      'Vary': 'Accept-Encoding'
    };
    const notModified = req.headers['if-none-match']
      ? req.headers['if-none-match'].split(',').some(value => value.trim() === etag || value.trim() === '*')
      : req.headers['if-modified-since'] && Math.floor(stat.mtimeMs / 1000) <= Date.parse(req.headers['if-modified-since']) / 1000;
    if (notModified) { res.writeHead(304, headers); return res.end(); }
    let data;
    if (useGzip) {
      const cached = compressed.get(filePath);
      if (cached && cached.etag === etag) data = cached.data;
      else {
        data = await gzip(await fs.promises.readFile(filePath));
        if (compressed.size >= 32) compressed.delete(compressed.keys().next().value);
        compressed.set(filePath, { etag, data });
      }
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = String(data ? data.length : stat.size);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    if (data) return res.end(data);
    const stream = fs.createReadStream(filePath);
    res.once('close', () => stream.destroy());
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch (err) {
    if (!res.headersSent) { res.writeHead(err.code === 'ENOENT' ? 404 : 500); res.end(); }
    else res.destroy();
  }
};
