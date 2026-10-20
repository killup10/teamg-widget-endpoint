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
function routing(ua, vod, directCdn, raw = false) {
  const requests = [], started = [];
  const ctx = { ua, isHls: !raw, isDirectCdn: directCdn, state: { recoveryVod: vod, currentPlaylist: { id: 'pl' }, auth: { token: 'token', deviceId: 'tv' }, screen: 'player', playerGeneration: 5 },
    API_BASE: 'https://app.test', streamUrl: raw ? 'http://source.test/play/a0cj' : 'https://source.test/live.m3u8', playUrl: 'original', v: { pause() {}, removeAttribute() {}, load() {} },
    apiCall: (...args) => requests.push(args), hideTuning() {}, showToast() {}, startSelectedPlayer: url => started.push(url) };
  vm.runInNewContext('(function(){' + source + '})()', ctx);
  return { ctx, requests, started };
}
for (const ua of ['NetCast', 'webOS', 'Web0S', 'Tizen', 'Chrome PC']) assert.equal(routing(ua, false, false).requests.length, 0);
assert.equal(routing('Android', true, false).requests.length, 0, 'VOD must keep existing player');
assert.equal(routing('Android', false, true).requests.length, 0, 'Compatible CDNs must remain direct');
for (const ua of ['Chrome PC', 'NetCast', 'webOS', 'Android']) {
  const raw = routing(ua, false, false, true);
  assert.equal(raw.requests[0][2].forceHls, true, ua + ': raw live TS needs HLS packaging');
  assert.deepEqual(raw.started, [], 'Do not open unsupported raw TS while preparing HLS');
  raw.requests[0][3](200, {ok:true,transcoded:true,url:'/converted.m3u8',sessionId:'raw'});
  assert.deepEqual(raw.started, ['https://app.test/converted.m3u8']);
}
const rawFailure = routing('Chrome PC', false, false, true);
rawFailure.requests[0][3](503, {error:'busy'});
assert.deepEqual(rawFailure.started,['original'],'Keep original fallback if preparation fails');
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
  audio.prepare = async (owner, url, forceHls) => { starts++; assert.equal(forceHls,true); return { transcoded: true, sessionId: 'test' }; };
  try {
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, token: 'bad' })).status, 401);
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, playlistId: 'not-assigned' })).status, 403);
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, url: 'https://not-assigned.test/live' })).status, 403);
    assert.equal((await call('/api/ott/android-audio/prepare', { ...body, url: 'file:///secret' })).status, 400);
    assert.equal(starts, 0, 'Denied requests must never spawn conversion');
    assert.equal((await call('/api/ott/android-audio/prepare', {...body, forceHls:true})).status, 200);
    assert.equal(starts, 1);
    await cols.playlists.updateOne({ _id: 'audio-pl' }, { $set: { expiresAt: '2000-01-01' } });
    assert.equal((await call('/api/ott/android-audio/prepare', body)).status, 410);
  } finally { audio.prepare = prepare; }
  let status;
  await audio.serve({ method: 'GET' }, { writeHead(code) { status = code; }, end() {} }, '/api/ott/android-audio/../../secret');
  assert.equal(status, 404);
  console.log('HLS/audio routing for raw TS on PC/TV, cancellation, assignment checks, expiry and asset validation passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
