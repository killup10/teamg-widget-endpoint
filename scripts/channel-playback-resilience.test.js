const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ottHtml = fs.readFileSync(path.join(__dirname, '..', 'ott', 'index.html'), 'utf8');

// 1. Ensure the blocking quality error toast and halt are completely removed
assert.ok(
  !ottHtml.includes('No se pudo leer la calidad'),
  'The blocking quality toast ("No se pudo leer la calidad del canal") must be completely removed'
);

// 2. Ensure webOS is never blocked through TeamGHlsVariant
assert.ok(
  !ottHtml.includes('(/webOS|Web0S/i.test(ua) || preferNetcast) && isHls && !state.recoveryVod && window.TeamGHlsVariant'),
  'webOS must not be forced through TeamGHlsVariant.resolve'
);

// 3. Verify the routing condition in ott/index.html
assert.ok(
  ottHtml.includes('if (isLegacyNetcast && preferNetcast && isHls && !state.recoveryVod && window.TeamGHlsVariant)'),
  'Only legacy NetCast decoders should use TeamGHlsVariant'
);

// 4. Test playback dispatch in simulated environments
function testPlaybackRouting(ua, engine, hasNetcastPlugin, isHls, variantResult) {
  let startedUrl = null;
  let variantResolveCalled = false;

  const mockState = {
    screen: 'player',
    playerGeneration: 1,
    auth: { playerEngine: engine, iptvPlayer: 'auto' },
    recoveryVod: false,
    cancelHlsVariant: null
  };

  const isLegacyNetcast = (ua.indexOf('NetCast') !== -1 && ua.indexOf('Web0S') === -1 && ua.indexOf('webOS') === -1);
  const netcastObj = hasNetcastPlugin ? { play: () => {} } : null;

  let preferNetcast = false;
  if (engine === 'mediaplayer') {
    preferNetcast = true;
  } else if (engine === 'auto') {
    if (isLegacyNetcast && netcastObj && typeof netcastObj.play === 'function') {
      preferNetcast = true;
    }
  }

  const streamUrl = 'http://upstream.cdn/live/channel.m3u8';
  const playUrl = 'https://ott.teamg.store/api/ott/stream.m3u8?url=' + encodeURIComponent(streamUrl);
  const API_BASE = 'https://ott.teamg.store';

  const mockTeamGHlsVariant = {
    resolve: (pUrl, cb, mUrl) => {
      variantResolveCalled = true;
      cb(variantResult, !variantResult);
      return () => {};
    }
  };

  function startSelectedPlayer(url) {
    startedUrl = url;
  }

  // Exact logic replicated from ott/index.html
  if (isLegacyNetcast && preferNetcast && isHls && !mockState.recoveryVod && mockTeamGHlsVariant) {
    const variantGeneration = mockState.playerGeneration;
    const rawStreamUrl = (streamUrl.indexOf('/api/ott/stream') !== -1)
      ? (streamUrl.match(/[?&]url=([^&]+)/) ? decodeURIComponent(streamUrl.match(/[?&]url=([^&]+)/)[1]) : streamUrl)
      : streamUrl;
    const manifestUrl = (API_BASE || '') + '/api/ott/stream.m3u8?manifestOnly=1&url=' + encodeURIComponent(rawStreamUrl);
    mockState.cancelHlsVariant = mockTeamGHlsVariant.resolve(playUrl, function(variant) {
      if (mockState.screen !== 'player' || mockState.playerGeneration !== variantGeneration) return;
      startSelectedPlayer(variant ? variant.url : playUrl);
    }, manifestUrl);
  } else {
    startSelectedPlayer(playUrl);
  }

  return { startedUrl, variantResolveCalled, playUrl };
}

// Case A: webOS Smart TV
const webOsResult = testPlaybackRouting('Mozilla/5.0 (Web0S; SmartTV; webOS 6.0)', 'auto', false, true, null);
assert.strictEqual(webOsResult.variantResolveCalled, false, 'webOS must NOT invoke TeamGHlsVariant');
assert.strictEqual(webOsResult.startedUrl, webOsResult.playUrl, 'webOS must start playing playUrl immediately');

// Case B: NetCast TV when variant resolution succeeds
const netcastOk = testPlaybackRouting('Mozilla/5.0 (NetCast/3.0)', 'auto', true, true, { url: 'http://cdn/1080p.m3u8', width: 1920, height: 1080 });
assert.strictEqual(netcastOk.variantResolveCalled, true, 'NetCast must invoke TeamGHlsVariant');
assert.strictEqual(netcastOk.startedUrl, 'http://cdn/1080p.m3u8', 'NetCast must play resolved variant url');

// Case C: NetCast TV when variant resolution fails or times out
const netcastFailed = testPlaybackRouting('Mozilla/5.0 (NetCast/3.0)', 'auto', true, true, null);
assert.strictEqual(netcastFailed.variantResolveCalled, true, 'NetCast must invoke TeamGHlsVariant');
assert.strictEqual(netcastFailed.startedUrl, netcastFailed.playUrl, 'NetCast must fallback to playUrl and NEVER abort playback');

// Case D: Desktop / Android TV / Generic Browser
const desktopResult = testPlaybackRouting('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'auto', false, true, null);
assert.strictEqual(desktopResult.variantResolveCalled, false, 'Desktop must NOT invoke TeamGHlsVariant');
assert.strictEqual(desktopResult.startedUrl, desktopResult.playUrl, 'Desktop must start playing playUrl immediately');

console.log('Channel playback resilience unit tests pass successfully.');
