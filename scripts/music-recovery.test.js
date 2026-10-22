const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const { EventEmitter } = require('node:events');

const ctx = { require, module: { exports: {} }, Buffer, URL, AbortController,
  AbortSignal, setTimeout, clearTimeout, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require.resolve('../ott-music'), 'utf8'), ctx);

(async () => {
  assert.equal(ctx.isOriginalCandidate('Die With A Smile (reverb)', 'Die With A Smile'), false);
  assert.equal(ctx.isOriginalCandidate('Die With A Smile (Official Audio)', 'Die With A Smile'), true);
  assert.equal(ctx.isOriginalCandidate('Another song', 'Die With A Smile'), false);

  // Un proveedor puede devolver una URL caducada aunque su API responda OK.
  let cancelled = false;
  ctx.fetch = async () => ({ ok: false, headers: new Headers(), body: {
    cancel: async () => { cancelled = true; }
  } });
  assert.equal(await ctx.isPlayableAudioStream({ url: 'https://audio.invalid' }), false);
  assert.equal(cancelled, true);

  vm.runInContext(`
    searchYouTubeCandidatesHtml = async () => ['abcdefghijk'];
    audioViaYouTubeI = async () => ({url:'https://audio.invalid/expired'});
    audioViaPiped = async () => ({url:'https://audio.invalid/working'});
    audioViaInvidious = async () => { throw new Error('No debe necesitar otro proveedor'); };
  `, ctx);
  ctx.fetch = async (url) => ({ ok: url.endsWith('/working'),
    headers: new Headers({ 'content-type': 'audio/mp4' }), body: { cancel: async () => {} } });
  const resolved = await ctx.module.exports.resolveAudioStream({artist:'Artist',title:'Song'});
  assert.equal(resolved.url, 'https://audio.invalid/working');

  // El cierre de la petición entrante no implica que la respuesta haya terminado.
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    res.write('audio');
    setTimeout(() => res.end('-complete'), 20);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const incoming = new EventEmitter();
  incoming.method = 'GET'; incoming.headers = {};
  const { PassThrough } = require('node:stream');
  const output = new PassThrough();
  output.writeHead = () => { output.headersSent = true; };
  let body = '';
  output.on('data', (chunk) => { body += chunk; });
  try {
    const done = new Promise((resolve, reject) => { output.on('end', resolve); output.on('error', reject); });
    ctx.proxyUpstreamAudio('http://127.0.0.1:' + upstream.address().port, incoming, output);
    incoming.emit('close');
    await done;
    assert.equal(body, 'audio-complete');
  } finally { upstream.close(); }
  console.log('Music recovery regression tests pass.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
