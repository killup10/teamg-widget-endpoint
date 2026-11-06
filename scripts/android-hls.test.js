const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('function playHtml5('), html.indexOf('function stopPlayer()'));
function player(ua, options = {}) {
  const instances = [], notices = [], calls = [];
  let recoveries = 0;
  const v = { style: {}, src: '', currentTime: 0, paused: true,
    canPlayType: () => options.native === false ? '' : 'maybe',
    pause() {}, removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {}, play() { calls.push('play'); return { catch(fn) { if (options.blocked) fn({ name: 'NotAllowedError' }); } }; }
  };
  function Hls() {
    this.events = {}; instances.push(this);
    this.loadSource = () => {};
    this.attachMedia = () => { v.src = 'blob:hls'; };
    this.on = (event, fn) => { this.events[event] = fn; };
    this.destroy = () => { this.destroyed = true; };
  }
  Hls.isSupported = () => options.mse !== false;
  Hls.Events = { LEVEL_LOADED: 'level', MANIFEST_PARSED: 'manifest', FRAG_BUFFERED: 'fragment', AUDIO_TRACKS_UPDATED: 'audio', ERROR: 'error' };
  const context = { window: { Hls, location: { href: 'https://ott.teamg.store/ott' } }, Hls,
    navigator: { userAgent: ua }, state: { auth: { hlsPlayer: options.engine || 'Automático' } },
    $: () => ({ textContent: '' }), hideTuning() {}, setBuffering() {}, updateDurationDisplay() {}, updateProgressDisplay() {},
    showToast: text => notices.push(text), recoverPlayback: () => recoveries++,
    setTimeout() {}, clearInterval() {}, setInterval() { return 1; }, console
  };
  vm.runInNewContext(source, context);
  const url = options.url || 'https://cdn.test/live.m3u8';
  context.playHtml5(v, null, url, url, {});
  return { v, instances, notices, calls, recoveries: () => recoveries };
}
const android = 'Mozilla/5.0 (Linux; Android 11; Android TV) Chrome/120.0';
let p = player(android);
assert.equal(p.instances.length, 1, 'Android must prefer hls.js even when native support reports maybe');
assert.equal(p.calls.length, 1, 'Android must request play during the remote gesture');
p.instances[0].events.error(null, { fatal: true });
assert.equal(p.instances[0].destroyed, true);
assert.equal(p.v.src, 'https://cdn.test/live.m3u8', 'Fatal JS error must try native once');
p.v.onerror();
assert.equal(p.instances.length, 1, 'Fallback must not loop between engines');
assert.equal(p.recoveries(), 1);
p = player(android, { engine: 'Native HLS player' });
assert.equal(p.instances.length, 0, 'Respect explicit native engine on first attempt');
p.v.onerror();
assert.equal(p.instances.length, 1, 'Native failure must try JS on Android');
assert.equal(player(android, { url: 'https://cdn.test/playlist?id=1' }).instances.length, 1);
assert.equal(player(android, { url: 'https://cdn.test/movie.mp4' }).instances.length, 0, 'VOD must stay direct');
assert.equal(player(android, { mse: false }).instances.length, 0, 'No MSE must use native');
assert.ok(player(android, { blocked: true }).notices.some(text => text.includes('Pulsa OK')));
for (const ua of ['NetCast', 'webOS', 'Web0S', 'Tizen', 'Mozilla/5.0 Chrome/120.0']) {
  assert.equal(player(ua).instances.length, 0, 'Existing native HLS selection must stay unchanged: ' + ua);
}

// Verify live audio transcode fallback when MSE rejects MP2/AC-3 audio inside an .m3u8 stream
{
  const instances = [], notices = [], apiRequests = [];
  let recoveries = 0;
  const v = { style: {}, src: '', currentTime: 2, paused: false,
    canPlayType: () => '',
    pause() {}, removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {}, play() { return { catch() {} }; }
  };
  function Hls() {
    this.events = {}; instances.push(this);
    this.loadSource = u => { this.url = u; };
    this.attachMedia = () => { v.src = 'blob:hls'; };
    this.on = (event, fn) => { this.events[event] = fn; };
    this.destroy = () => { this.destroyed = true; };
  }
  Hls.isSupported = () => true;
  Hls.Events = { LEVEL_LOADED: 'level', MANIFEST_PARSED: 'manifest', FRAG_BUFFERED: 'fragment', AUDIO_TRACKS_UPDATED: 'audio', ERROR: 'error' };
  const context = {
    window: { Hls, location: { href: 'https://ott.teamg.store/ott', protocol: 'https:' } }, Hls,
    API_BASE: 'https://ott.teamg.store',
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0' },
    state: { screen: 'player', playerGeneration: 7, recoveryVod: false, currentPlaylist: { id: 'pl-1' }, auth: { token: 'tk', deviceId: 'dev-1', hlsPlayer: 'Automático' } },
    $: () => ({ textContent: '' }), hideTuning() {}, showTuning() {}, setBuffering() {}, updateDurationDisplay() {}, updateProgressDisplay() {},
    showToast: text => notices.push(text), recoverPlayback: () => recoveries++,
    apiCall: (...args) => apiRequests.push(args),
    setTimeout() {}, clearInterval() {}, setInterval() { return 1; }, console
  };
  vm.runInNewContext(source, context);
  const rawStream = 'http://190.117.20.34:8000/play/a0f1/index.m3u8';
  const proxyUrl = 'https://ott.teamg.store/api/ott/stream.m3u8?url=' + encodeURIComponent(rawStream);
  const item = { name: 'Canal N (PER)', url: rawStream };
  context.playHtml5(v, null, proxyUrl, rawStream, item);
  assert.equal(instances.length, 1);
  // Trigger fatal MSE error (e.g. MP2 audio rejected by SourceBuffer)
  instances[0].events.error(null, { fatal: true });
  assert.equal(recoveries, 0, 'Must attempt AAC transcode fallback before triggering recoverPlayback loop');
  assert.equal(notices.length, 0, 'Must not show interruption toast while preparing AAC stream');
  assert.equal(apiRequests.length, 1);
  assert.equal(apiRequests[0][1], '/api/ott/android-audio/prepare');
  assert.equal(apiRequests[0][2].url, rawStream);
  assert.equal(apiRequests[0][2].forceHls, true);
  // Simulate server returning transcoded AAC HLS session
  apiRequests[0][3](200, { ok: true, transcoded: true, sessionId: 'aac-1', url: '/api/ott/android-audio/aac-1/index.m3u8' });
  assert.equal(instances.length, 2, 'Must open new hls.js instance with transcoded AAC stream');
  assert.equal(instances[1].url, 'https://ott.teamg.store/api/ott/android-audio/aac-1/index.m3u8');
}
console.log('Android HLS selection, gesture startup, bounded fallback and LG/Samsung/VOD routing passed.');
