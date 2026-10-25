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
  const hevcFixture = path.join(dir, 'fixture-hevc10.mkv');
  let upstream, output;
  try {
    const generated = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264',
      '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fixture
    ], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(generated.status, 0, generated.stderr || 'Could not generate MKV fixture');

    const generatedHevc = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx265',
      '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le', '-c:a', 'aac', '-shortest', hevcFixture
    ], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(generatedHevc.status, 0, generatedHevc.stderr || 'Could not generate HEVC 10-bit MKV fixture');

    upstream = http.createServer((req, res) => {
      const target = req.url && req.url.includes('hevc10') ? hevcFixture : fixture;
      const stat = fs.statSync(target);
      res.writeHead(200, { 'Content-Type': 'video/x-matroska', 'Content-Length': stat.size });
      fs.createReadStream(target).pipe(res);
    });
    await listen(upstream);
    output = http.createServer((req, res) => vod.serve(req, res, new URL(req.url, 'http://localhost').pathname));
    await listen(output);

    const source = 'http://127.0.0.1:' + upstream.address().port + '/fixture.mkv';
    const result = await vod.prepare('test-user/test-device', source);
    assert.equal(result.transcodedVideo, false, '8-bit H.264 MKV should stream copy video');
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

    const hevcSource = 'http://127.0.0.1:' + upstream.address().port + '/fixture-hevc10.mkv';
    const hevcResult = await vod.prepare('test-user/test-device', hevcSource);
    assert.equal(hevcResult.transcodedVideo, true, '10-bit HEVC MKV must transcode video to 8-bit H.264');
    const hevcManifest = (await get(output.address().port, hevcResult.url)).body.toString('utf8');
    const hevcSegPath = hevcManifest.match(/^(segment-\d+\.ts)$/m)[1];
    const hevcSegResp = await get(output.address().port, hevcResult.url.replace(/index\.m3u8$/, hevcSegPath));
    const hevcSegFile = path.join(dir, 'segment-hevc10.ts');
    fs.writeFileSync(hevcSegFile, hevcSegResp.body);
    const hevcProbe = spawnSync(ffmpeg, ['-hide_banner', '-i', hevcSegFile], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
    assert.match(hevcProbe.stderr, /Video:\s*h264/i, 'Transcoded HEVC segment must contain H.264 video');
    assert.match(hevcProbe.stderr, /yuv420p\b/i, 'Transcoded HEVC segment must use 8-bit yuv420p pixel format');
    await vod.stop('test-user/test-device', hevcResult.sessionId);
    console.log('MKV (H.264 8-bit copy + HEVC 10-bit to H.264 8-bit transcode) VOD HLS pass.');
  } finally {
    if (output) await close(output);
    if (upstream) await close(upstream);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
