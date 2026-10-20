const http = require('node:http');
const assert = require('node:assert/strict');
const {handleStream} = require('../ott-api');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const ts = Buffer.alloc(188 * 8, 0x12);
for (let i = 0; i < ts.length; i += 188) ts[i] = 0x47;
const mp4 = Buffer.from('00000000ftypisom');
const upstream = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'application/octet-stream'});
  const body = req.url === '/play/channel' ? ts : mp4;
  res.write(body.subarray(0, 80));
  setTimeout(() => res.end(body.subarray(80)), 5);
});
const proxy = http.createServer((req, res) => {
  handleStream(req, res, {url: 'http://127.0.0.1:' + upstream.address().port + req.url});
});
async function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + proxy.address().port + path, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({type:res.headers['content-type'], body:Buffer.concat(chunks)}));
    }).on('error', reject);
  });
}
(async () => {
  try {
    await listen(upstream); await listen(proxy);
    const live = await get('/play/channel');
    assert.equal(live.type, 'video/mp2t');
    assert.deepEqual(live.body, ts, 'Sniffing must preserve all stream bytes');
    const movie = await get('/play/movie');
    assert.equal(movie.type, 'video/mp4');
    assert.deepEqual(movie.body, mp4, 'Short non-TS responses must complete');
    console.log('Extensionless TS MIME detection and byte preservation pass.');
  } finally { proxy.close(); upstream.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
