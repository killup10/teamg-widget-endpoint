const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const ffmpeg = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpeg;
const vod = require('../vod-hls');

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
function close(server) {
  return new Promise(resolve => server.close(resolve));
}
function get(port, route) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + port + route, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamg-vod-test-'));
  const fixture = path.join(dir, 'fixture.mkv');
  let upstream, output;
  try {
    const generated = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264',
      '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fixture
    ], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(generated.status, 0, generated.stderr || 'Could not generate MKV fixture');

    upstream = http.createServer((req, res) => {
      const stat = fs.statSync(fixture);
      res.writeHead(200, { 'Content-Type': 'video/x-matroska', 'Content-Length': stat.size });
      fs.createReadStream(fixture).pipe(res);
    });
    await listen(upstream);
    output = http.createServer((req, res) => vod.serve(req, res, new URL(req.url, 'http://localhost').pathname));
    await listen(output);

    const source = 'http://127.0.0.1:' + upstream.address().port + '/fixture.mkv';
    const result = await vod.prepare('test-user/test-device', source);
    const manifestResponse = await get(output.address().port, result.url);
    assert.equal(manifestResponse.status, 200);
    assert.match(manifestResponse.type, /mpegurl/);
    const manifest = manifestResponse.body.toString('utf8');
    assert.match(manifest, /#EXT-X-PLAYLIST-TYPE:VOD/);
    assert.match(manifest, /#EXT-X-ENDLIST/);
    const segmentPath = manifest.match(/^(segment-\d+\.ts)$/m)[1];
    const segmentResponse = await get(output.address().port, result.url.replace(/index\.m3u8$/, segmentPath));
    assert.equal(segmentResponse.status, 200);
    assert.match(segmentResponse.type, /mp2t/);
    assert.ok(segmentResponse.body.length > 1000, 'HLS segment must contain audio/video packets');

    const segmentFile = path.join(dir, 'segment.ts');
    fs.writeFileSync(segmentFile, segmentResponse.body);
    const decoded = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', segmentFile, '-frames:v', '1', '-f', 'null', '-'], {
      windowsHide: true, encoding: 'utf8', timeout: 15000
    });
    assert.equal(decoded.status, 0, decoded.stderr || 'HLS video segment did not decode');

    await vod.stop('test-user/test-device', result.sessionId);
    assert.equal((await get(output.address().port, result.url)).status, 404, 'Stopping a session must revoke its playlist URL');
    console.log('MKV to VOD HLS remux, segment serving, video decode and cleanup pass.');
  } finally {
    if (output) await close(output);
    if (upstream) await close(upstream);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
