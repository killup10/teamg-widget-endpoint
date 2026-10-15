const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
delete process.env.MONGODB_URI;
const store = require('../ott-store');
const { handle } = require('../ott-api');
const audio = require('../android-audio');
const html = fs.readFileSync('ott/index.html', 'utf8');
const start = html.indexOf('  var androidLiveAudio =');
const source = html.slice(start, html.indexOf('  // Resolve a single AVC', start));
function routing(ua, vod, directCdn) {
  const requests = [], started = [];
  const ctx = { ua, isDirectCdn: directCdn, state: { recoveryVod: vod, currentPlaylist: { id: 'pl' }, auth: { token: 'token', deviceId: 'tv' }, screen: 'player', playerGeneration: 5 },
    API_BASE: 'https://app.test', streamUrl: 'https://source.test/live', playUrl: 'original', v: { pause() {}, removeAttribute() {}, load() {} },
    apiCall: (...args) => requests.push(args), showToast() {}, startSelectedPlayer: url => started.push(url) };
  vm.runInNewContext('(function(){' + source + '})()', ctx);
  return { ctx, requests, started };
}
for (const ua of ['NetCast', 'webOS', 'Web0S', 'Tizen', 'Chrome PC']) assert.equal(routing(ua, false, false).requests.length, 0);
assert.equal(routing('Android', true, false).requests.length, 0, 'VOD must keep existing player');
assert.equal(routing('Android', false, true).requests.length, 0, 'Compatible CDNs must remain direct');
let r = routing('Android', false, false);
assert.equal(r.requests[0][1], '/api/ott/android-audio/prepare');
r.requests[0][3](200, { ok: true, transcoded: true, url: '/converted.m3u8', sessionId: 'id' });
assert.deepEqual(r.started, ['original', 'https://app.test/converted.m3u8']);
r = routing('Android', false, false);
r.ctx.state.playerGeneration++;
r.requests[0][3](200, { ok: true, transcoded: true, sessionId: 'abandoned' });
assert.deepEqual(r.started, ['original'], 'A stale conversion must never play after changing channels');
assert.equal(r.requests[1][1], '/api/ott/android-audio/stop');

async function call(path, body) {
  let status, data;
  await handle({ method: 'POST', headers: {} }, { writeHead(code) { status = code; }, end(raw) { data = JSON.parse(raw); } }, path, {}, body);
  return { status, data };
}
(async () => {
  const cols = await store.init();
  await cols.users.insertOne({ _id: 'audio-user', login: 'audio-client', active: true, salt: 'salt', pass: store.hashPass('test', 'salt') });
  await cols.playlists.insertOne({ _id: 'audio-pl', customM3u: '#EXTM3U\n#EXTINF:-1,Test\nhttps://source.test/channel.m3u8\n' });
  await cols.devices.insertOne({ _id: 'audio-tv', userId: 'audio-user', playlists: ['audio-pl'] });
  const login = await call('/api/ott/login', { login: 'audio-client', password: 'test' });
  const body = { token: login.data.token, deviceId: 'audio-tv', playlistId: 'audio-pl', url: 'https://source.test/channel.m3u8' };
  let starts = 0;
  const prepare = audio.prepare;
  audio.prepare = async () => { starts++; return { transcoded: true, sessionId: 'test' }; };
  try {
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, token: 'bad' })).status, 401);
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, playlistId: 'not-assigned' })).status, 403);
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, url: 'https://not-assigned.test/live' })).status, 403);
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, url: 'file:///secret' })).status, 400);
    assert.equal(starts, 0, 'Denied requests must never spawn conversion');
    assert.equal((await call('/api/ott/android-audio/prepare', body)).status, 200);
    assert.equal(starts, 1);
    await cols.playlists.updateOne({ _id: 'audio-pl' }, { $set: { expiresAt: '2000-01-01' } });
    assert.equal((await call('/api/ott/android-audio/prepare', body)).status, 410);
  } finally { audio.prepare = prepare; }
  let status;
  await audio.serve({ method: 'GET' }, { writeHead(code) { status = code; }, end() {} }, '/api/ott/android-audio/../../secret');
  assert.equal(status, 404);
  console.log('Android-only audio routing, cancellation, assignment checks, expiry and asset path validation passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
