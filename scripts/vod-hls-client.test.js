const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');

const routeStart = html.indexOf('  var needsVodRemux =');
const routeEnd = html.indexOf('  var androidLiveAudio =', routeStart);
const routeSource = html.slice(routeStart, routeEnd);
assert.ok(routeStart >= 0 && routeEnd > routeStart, 'VOD normalization dispatch must exist');

function routeOnPc() {
  const calls = [], started = [];
  const context = {
    state: { screen: 'player', playerGeneration: 7, recoveryVod: true,
      currentPlaylist: { id: 'assigned-catalog' }, currentSeries: null,
      auth: { token: 'device-token', deviceId: 'device-id' } },
    streamUrl: 'https://teamg.store/boruto1x257.mkv', playUrl: 'https://teamg.store/boruto1x257.mkv',
    isLegacyNetcast: false, netcastObj: null, forceHtml5Player: false,
    c: { url: 'https://teamg.store/boruto1x257.mkv' }, API_BASE: 'https://ott.teamg.store',
    startSelectedPlayer: url => started.push(url),
    startNetcastPlayer: () => { throw new Error('PC must not invoke LG MediaPlayer'); },
    apiCall: (method, route, payload, callback) => {
      calls.push({ method, route, payload });
      callback(200, { ok: true, sessionId: 'c'.repeat(48), url: '/api/ott/vod-hls/' + 'c'.repeat(48) + '/index.m3u8' });
    }
  };
  vm.runInNewContext('(function(){' + routeSource + '})()', context);
  assert.equal(calls[0].route, '/api/ott/vod-hls/prepare');
  assert.equal(calls[0].payload.url, 'https://teamg.store/boruto1x257.mkv');
  assert.deepEqual(started, ['https://ott.teamg.store/api/ott/vod-hls/' + 'c'.repeat(48) + '/index.m3u8']);
}

function preparedHlsUsesMse() {
  const start = html.indexOf('  var nativeHls = !!');
  const end = html.indexOf('  function tryAndroidHlsFallback()', start);
  const source = html.slice(start, end);
  const selected = vm.runInNewContext('(function(){' + source + ';return {nativeHls:nativeHls,wantsJs:wantsJs,jsHlsSupported:jsHlsSupported,useJsHls:useJsHls};})()', {
    playUrl: 'https://ott.teamg.store/api/ott/vod-hls/' + 'c'.repeat(48) + '/index.m3u8',
    streamUrl: 'https://teamg.store/boruto1x257.mkv',
    v: { canPlayType: () => '' },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0' },
    window: { Hls: { isSupported: () => true } }, Hls: { isSupported: () => true },
    state: { auth: { hlsPlayer: 'Native HLS player' } }, androidFallbackEngine: undefined
  });
  assert.equal(selected.nativeHls, false);
  assert.equal(selected.jsHlsSupported, true);
  assert.equal(selected.useJsHls, true, 'A browser without native HLS must use hls.js for prepared MKV VOD');
}

routeOnPc();
preparedHlsUsesMse();
console.log('PC MKV VOD is sent through authenticated HLS preparation and hls.js/MSE.');
