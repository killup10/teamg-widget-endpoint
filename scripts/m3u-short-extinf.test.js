const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const api = fs.readFileSync('ott-api.js', 'utf8');
const html = fs.readFileSync('ott/index.html', 'utf8');
const ctx = { resolveIconUrl: s => s };
vm.createContext(ctx);
vm.runInContext(api.slice(api.indexOf('function parseM3uText('), api.indexOf('function serializeChannelsToM3u(')), ctx);
vm.runInContext(html.slice(html.indexOf('function parseM3U('), html.indexOf('function loadPlaylistContent(')), ctx);
const names = ['Trailer Get Jiro! (2026)', 'T1 E1 - Piloto Get Jiro', 'T1 E2 - La carne es muerte', 'T1 E3 - El hortelano', 'T1 E4 - Salsa secreta'];
const source = '#EXTM3U\n' + names.map((name, i) => '#EXTINF:' + name + '\n#EXTGRP:Get Jiro!\nhttps://teamg.store/getjir' + i + '.mkv').join('\n') + '\n#EXTINF:-1 tvg-logo="https://example.com/logo" group-title="South Park",T1 E1 - Cartman\nhttps://example.com/southpark.mkv';
for (const parse of [s => ctx.parseM3uText(s).channels, ctx.parseM3U]) {
  const channels = parse(source);
  assert.equal(channels.length, 6);
  assert.deepEqual(Array.from(channels.slice(0, 5), c => c.name), names);
  assert.ok(channels.slice(0, 5).every(c => c.group === 'Get Jiro!'));
  assert.equal(channels[5].name, 'T1 E1 - Cartman');
  assert.equal(channels[5].logo, 'https://example.com/logo');
  const merged = ctx.mergePlaylistSource([], channels);
  assert.equal(merged.channels.length, 6, 'Source sync must retain every episode');
  assert.equal(parse('#EXTINF:-1\nhttps://example.com/live')[0].name, 'Canal');
}
console.log('Short EXTINF titles retain all episodes in API, player and source sync.');
