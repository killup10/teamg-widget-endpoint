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

  // Si un cliente entrega audio bloqueado, probar el siguiente cliente.
  vm.runInContext('getYouTubeVisitorData = async () => "";', ctx);
  let clientRequests = 0;
  ctx.fetch = async (url) => {
    if (url.includes('/youtubei/')) {
      clientRequests++;
      return { ok: true, json: async () => ({ streamingData: { adaptiveFormats: [
        { itag: 140, url: 'https://audio.invalid/' + clientRequests, mimeType: 'audio/mp4' }
      ] } }) };
    }
    return { ok: url.endsWith('/2'), headers: new Headers({ 'content-type': 'audio/mp4' }),
      body: { cancel: async () => {} } };
  };
  assert.equal((await ctx.audioViaYouTubeI('abcdefghijk')).url, 'https://audio.invalid/2');
  assert.equal(clientRequests, 2);

  const html = fs.readFileSync(require.resolve('../ott/index.html'), 'utf8');
  const elements = {};
  const video = { pause() { this.paused = true; }, removeAttribute() {}, load() {} };
  elements['video-el'] = video;
  let scheduled = 0, bufferingCleared = false, lyricsStopped = false;
  const player = {
    state: { screen: 'player', recoveryItem: { url: '/api/ott/music/stream.mp4?v=abcdefghijk' } },
    $: (id) => elements[id] || (elements[id] = { style: {} }),
    clearTimeout() {}, clearInterval() {},
    setTimeout() { scheduled++; }, isMusicPlaying: () => true,
    hideTuning() { bufferingCleared = true; },
    stopLyricsTimer() { lyricsStopped = true; }
  };
  vm.runInNewContext(html.slice(html.indexOf('function failMusicPlayback()'),
    html.indexOf('function monitorPlaybackRecovery(')), player);
  player.recoverPlayback();
  assert.equal(scheduled, 0, 'No reconectar indefinidamente una canción no disponible');
  assert.equal(player.state.musicPlaybackFailed, true);
  assert.equal(bufferingCleared, true);
  assert.equal(lyricsStopped, true);
  assert.equal(video.paused, true);
  assert.equal(elements['player-time-text'].textContent, 'NO DISPONIBLE');

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
