'use strict';
// Audit reproductions: known defects are asserted as observations, not approved behavior.
// Providers are stubbed. No external network, credentials, MongoDB or production changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const requireMusic = createRequire(path.join(root, 'ott-music.js'));
function response() {
  const res = new EventEmitter();
  res.setHeader = () => {};
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers; res.headersSent = true; };
  res.end = data => { res.bytes = data ? Buffer.byteLength(data) : 0; res.data = data; };
  return res;
}
async function musicAudit() {
  let calls = 0;
  const audio = Buffer.alloc(1024 * 1024, 1);
  const context = {
    process: { env: { ENABLE_DEEZER_PROXY: '1' } },
    require: name => name === './deezer-service' ? { resolveViaDeezerBuffer: async () => {
      calls++; await new Promise(resolve => setTimeout(resolve, 15));
      return { buffer: audio, mimeType: 'audio/mpeg' };
    } } : requireMusic(name),
    module: { exports: {} }, Buffer, URL, AbortController, AbortSignal,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => ms === 2000 && String(fn).includes('topTracks') ? {} : setTimeout(fn, ms),
    clearTimeout, fetch: () => { throw new Error('External network disabled'); }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'ott-music.js'), 'utf8'), context);
  const req = (method = 'GET') => ({ method, url: '/api/ott/music/stream.mp4', headers: {} });
  const head = response();
  await context.module.exports.handleMusicStream(req('HEAD'), head, req().url, { artist: 'Audit', title: 'Head' });
  assert.equal(calls, 1, 'Confirmed defect: a cold HEAD resolves a complete audio buffer');
  assert.equal(head.bytes, 0);
  assert.equal(head.headers['Content-Type'], 'video/mp4', 'Confirmed defect: MP3 advertised as MP4');
  const before = calls;
  await Promise.all([response(), response()].map(res => context.module.exports.handleMusicStream(
    req(), res, req().url, { artist: 'Audit', title: 'Concurrent' })));
  assert.equal(calls - before, 2, 'Confirmed defect: no shared in-flight Deezer resolution');
  const suffix = response();
  context.auditReq = { ...req(), headers: { range: 'bytes=-128' } };
  context.auditRes = suffix;
  vm.runInContext('serveAudioBufferWithRange(auditReq, auditRes, Buffer.alloc(1048576), "audio/mpeg")', context);
  assert.equal(suffix.headers['Content-Range'], 'bytes 0-128/1048576');
  console.log('CONFIRMED music: HEAD downloads full audio; concurrent miss downloads twice; MP3 MIME mismatch; suffix Range wrong.');
}
function serverAudit() {
  let handler, streamCalls = 0, imageDownloads = 0;
  const requestModule = {
    get(target, options, callback) {
      imageDownloads++;
      const upstream = new EventEmitter();
      upstream.statusCode = 200; upstream.headers = { 'content-type': 'text/plain' };
      callback(upstream);
      upstream.emit('data', Buffer.alloc(2 * 1024 * 1024));
      upstream.emit('end');
      return new EventEmitter();
    }
  };
  const serverRequire = createRequire(path.join(root, 'server.js'));
  const context = {
    process: { env: { ENABLE_DEEZER_PROXY: '1' } },
    require: name => name === 'http' ? { ...requestModule, createServer(fn) { handler = fn; return { listen() {} }; } }
      : name === 'https' ? requestModule
      : name === './ott-api' ? { handleStream() { streamCalls++; } } : serverRequire(name),
    __dirname: root, process: { env: {} }, URL, Buffer, ArrayBuffer,
    console: { log() {}, warn() {}, error() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context);
  handler({ method: 'GET', url: '/api/ott/stream.ts?url=https%3A%2F%2Fexample.invalid%2Fvideo', headers: {} }, response());
  assert.equal(streamCalls, 1, 'Confirmed: stream is routed without authentication');
  const head = response();
  handler({ method: 'HEAD', url: '/api/ott/img?url=https%3A%2F%2Fexample.invalid%2Fnon-image', headers: {} }, head);
  assert.equal(imageDownloads, 1, 'Confirmed: image HEAD fetches full upstream GET');
  assert.equal(head.bytes, 2 * 1024 * 1024);
  assert.equal(head.headers['Content-Type'], 'text/plain');
  console.log('CONFIRMED proxy: no-auth stream route; image HEAD downloads whole non-image body (2 MiB fixture accepted).');
}
async function staticAudit() {
  const serve = require('../static-files');
  const file = path.join(root, 'ott/index.html');
  const server = http.createServer((req, res) => serve(file, req, res, { '.html': 'text/html' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    http.request({ host: '127.0.0.1', port: server.address().port, headers, method }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) }));
    }).on('error', reject).end();
  });
  try {
    const plain = await request(), zipped = await request({ 'Accept-Encoding': 'gzip' });
    assert.deepEqual(zlib.gunzipSync(zipped.data), plain.data);
    const cached = await request({ 'If-None-Match': plain.headers.etag });
    assert.equal(cached.status, 304); assert.equal(cached.data.length, 0);
    const head = await request({}, 'HEAD'); assert.equal(head.data.length, 0);
    assert.equal(Number(head.headers['content-length']), plain.data.length);
    const disabled = await request({ 'Accept-Encoding': 'gzip;q=0' });
    assert.equal(disabled.headers['content-encoding'], undefined);
    console.log(`VERIFIED local static change: ${plain.data.length} -> ${zipped.data.length} bytes; gzip integrity, conditional GET, HEAD, gzip;q=0 pass.`);
  } finally { server.close(); }
}
(async () => { await musicAudit(); serverAudit(); await staticAudit(); })().catch(error => {
  console.error(error); process.exitCode = 1;
});
