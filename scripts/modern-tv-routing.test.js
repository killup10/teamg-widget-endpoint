const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('  var streamUrl = c.url'), html.indexOf('  probeSubtitles(c.url || playUrl'));
function route(ua, protocol, url, engine = 'auto', native = false) {
  const context = {
    c: {url}, navigator: {userAgent: ua},
    window: {location: {protocol, host: 'ott.teamg.store'}, TeamGNative: {}},
    TeamGNative: {available: () => native},
    state: {auth: {playerEngine: engine}},
    $: () => ({style: {}, play() {}})
  };
  vm.runInNewContext(source, context);
  return context;
}
for (const ua of ['Web0S', 'webOS', 'NetCast Web0S', 'SMART-TV Tizen']) {
  for (const protocol of ['http:', 'https:']) {
    const url = 'https://example.cloudfront.net/live.m3u8';
    const result = route(ua, protocol, url, 'mediaplayer');
    assert.equal(result.playUrl, url, 'Modern TVs preserve HTTPS even on an HTTP page');
    assert.equal(result.preferNetcast, false, 'A stale preference cannot select NetCast');
  }
  const result = route(ua, 'https:', 'http://provider.test/live.m3u8');
  assert.match(result.playUrl, /^https:\/\/ott.teamg.store\/api\/ott\/stream.m3u8\?url=/);
}
assert.equal(route('NetCast', 'http:', 'https://example.cloudfront.net/live.m3u8').playUrl,
  'http://example.cloudfront.net/live.m3u8', 'Preserve legacy HTTP compatibility');
assert.equal(route('NetCast', 'http:', 'http://provider.test/live.ts').preferNetcast, true);
assert.equal(route('SMART-TV Tizen', 'https:', 'https://provider.test/live.m3u8', 'mediaplayer', true).useNative, true);
console.log('Modern TV protocol handling, saved engine migration and Samsung native routing pass.');
