const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const store = require('../ott-store');
const { handle } = require('../ott-api');
const ottMusic = require('../ott-music');

(async () => {
  // 1. Validar catálogo base y radios en vivo de ott-music.js
  assert.ok(Array.isArray(ottMusic.LIVE_RADIOS) && ottMusic.LIVE_RADIOS.length >= 10, 'Debe incluir las 10 radios en vivo verificadas');
  assert.ok(Array.isArray(ottMusic.CURATED_TRACKS) && ottMusic.CURATED_TRACKS.length >= 40, 'Debe incluir el catálogo musical curado por géneros');

  const bbyWowTrack = ottMusic.CURATED_TRACKS.find((t) => t.title && t.title.toLowerCase().includes('bby wow'));
  assert.ok(bbyWowTrack, 'Debe incluir "BbY WOW" de KAROL G en el catálogo curado para Smart TV');

  const m3u = await ottMusic.buildMusicM3u('https://ott.teamg.store', '', false);
  assert.ok(m3u.startsWith('#EXTM3U\n'), 'El catálogo de TeamG Music debe ser un M3U válido');
  assert.ok(m3u.includes('group-title="🔥 Más Escuchado"'), 'Debe incluir categoría Más Escuchado');
  assert.ok(m3u.includes('group-title="📻 Radios en Vivo 24/7"'), 'Debe incluir categoría Radios en Vivo 24/7');
  assert.ok(m3u.includes('group-title="💃 Reggaetón & Urbano"'), 'Debe incluir categoría Reggaetón & Urbano');
  assert.ok(m3u.includes('group-title="🎺 Salsa, Cumbia & Tropical"'), 'Debe incluir categoría Salsa, Cumbia & Tropical');
  assert.ok(m3u.includes('BbY WOW'), 'El M3U debe incluir "BbY WOW" en el catálogo');
  assert.ok(m3u.includes('/api/ott/music/stream.mp4?'), 'Las canciones deben apuntar al endpoint /api/ott/music/stream.mp4');
  assert.ok(m3u.includes('/api/ott/music/radio.mp3?id=la-zona'), 'Las radios deben apuntar al endpoint /api/ott/music/radio');

  // 2. Validar endpoint /api/ott/m3u?pid=__music y /api/ott/music/m3u con dispositivo autenticado
  const cols = await store.init();
  const u = { _id: 'u_music_test', login: 'musicuser', pass: store.hashPass('123456', 's1'), salt: 's1', role: 'client', active: true };
  await cols.users.insertOne(u);

  let status, resData;
  await handle(
    { method: 'POST', headers: {} },
    { writeHead(s) { status = s; }, end(raw) { resData = JSON.parse(raw); } },
    '/api/ott/login',
    {},
    { login: 'musicuser', password: '123456' }
  );
  assert.equal(status, 200);
  const token = resData.token;

  await handle(
    { method: 'POST', headers: {} },
    { writeHead(s) { status = s; }, end(raw) { resData = JSON.parse(raw); } },
    '/api/ott/device',
    {},
    { token, deviceId: 'tv_netcast_music', name: 'LG NetCast TV' }
  );
  assert.equal(status, 200);

  let m3uStatus = 0, m3uBody = '';
  await handle(
    { method: 'GET', headers: { host: 'ott.teamg.store', 'x-forwarded-proto': 'https' } },
    { writeHead(s) { m3uStatus = s; }, end(raw) { m3uBody = String(raw || ''); } },
    '/api/ott/m3u',
    { token, deviceId: 'tv_netcast_music', pid: '__music' },
    {}
  );
  assert.equal(m3uStatus, 200, 'El endpoint /api/ott/m3u?pid=__music debe responder 200 para cualquier TV vinculada');
  assert.ok(m3uBody.includes('#EXTM3U') && m3uBody.includes('Radio La Zona 90.5 FM'));

  // 3. Validar integración en ott/index.html (pestaña en Home y buscador en tiempo real)
  const html = fs.readFileSync(path.join(__dirname, '..', 'ott', 'index.html'), 'utf8');
  assert.ok(html.includes("var musicPl = { id: '__music', name: '🎵 TeamG Music', isMusic: true };"), 'getHomeTabsList debe incluir la pestaña 🎵 TeamG Music');
  assert.ok(html.includes('id="player-music-stage"'), 'El reproductor debe incluir la carátula visual ligera para TeamG Music');

  const getHomeTabsStart = html.indexOf('function visiblePlaylists()');
  const getHomeTabsEnd = html.indexOf('function getTabsList()');
  const homeTabsCtx = {
    state: { playlists: [{ id: 'cine', name: 'Cine por Género' }] },
    isPlExpired() { return false; }
  };
  vm.runInNewContext(html.slice(getHomeTabsStart, getHomeTabsEnd), homeTabsCtx);
  const tabs = homeTabsCtx.getHomeTabsList();
  assert.equal(tabs.length, 3);
  assert.equal(tabs[0].id, 'cine');
  assert.equal(tabs[1].id, '__music');
  assert.equal(tabs[1].name, '🎵 TeamG Music');
  assert.equal(tabs[2].id, '__fav');

  // 4. Validar Escudo Render Free (Redirección 302 directa sin gastar ancho de banda en TVs modernas)
  let radioStatus = 0, radioHeaders = {};
  await ottMusic.handleMusicStream(
    { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36' } },
    { writeHead(s, h) { radioStatus = s; radioHeaders = h || {}; }, end() {} },
    '/api/ott/music/radio.mp3',
    { id: 'la-zona' }
  );
  assert.equal(radioStatus, 302, 'En TVs modernas la radio debe redirigir 302 directo sin consumir ancho de banda de Render');
  assert.ok(radioHeaders.Location && radioHeaders.Location.includes('mdstrm.com'));
  assert.equal(ottMusic.isIpBoundUrl('https://rr1---sn-abc.googlevideo.com/videoplayback?itag=140'), true);
  assert.equal(ottMusic.isIpBoundUrl('https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview.m4a'), false);

  // 5. Validar Auto-Avance continuo y controles de pista siguiente/anterior
  assert.ok(html.includes('function advanceMusicTrack()'), 'ott/index.html debe implementar advanceMusicTrack()');
  assert.ok(html.includes('function isMusicPlaying()'), 'ott/index.html debe implementar isMusicPlaying()');
  assert.ok(html.includes('isNextTrack') && html.includes('isPrevTrack'), 'handlePlayerNav debe soportar MediaTrackNext y MediaTrackPrevious');
  assert.ok(html.includes('cur >= dur - 0.45'), 'ontimeupdate o ticker deben tener guardias de fin de archivo para auto-avance continuo');

  // Simular avance automático en contexto VM
  let playedIdx = -1;
  const advanceCtx = {
    state: {
      currentPlaylist: { id: '__music' },
      currentChannelIdx: 2,
      recoveryItem: { url: '/api/ott/music/stream.mp4?id=test' },
      _advancingMusic: false
    },
    lastChannelChangeTime: 500,
    setTimeout: (fn) => fn(),
    getFilteredChannels: () => [
      { id: '1', name: 'Track 1' },
      { id: '2', name: 'Track 2' },
      { id: '3', name: 'Track 3' },
      { id: '4', name: 'Track 4' }
    ],
    playChannelAt: (idx) => { playedIdx = idx; }
  };
  const advanceFuncStart = html.indexOf('function isMusicPlaying()');
  const advanceFuncEnd = html.indexOf('function updateDurationDisplay(v)');
  vm.runInNewContext(html.slice(advanceFuncStart, advanceFuncEnd), advanceCtx);
  advanceCtx.advanceMusicTrack();
  assert.equal(playedIdx, 3, 'advanceMusicTrack debe avanzar automáticamente a la pista siguiente (índice 3)');

  // 6. Validar Karaoke y Letras Sincronizadas (Backend & Frontend UI)
  assert.ok(typeof ottMusic.parseLrcToCues === 'function', 'ottMusic debe exportar parseLrcToCues');
  assert.ok(typeof ottMusic.handleMusicLyrics === 'function', 'ottMusic debe exportar handleMusicLyrics');

  const sampleLrc = '[00:00.50] Primera línea\n[00:02.30] Segunda línea';
  const parsedCues = ottMusic.parseLrcToCues(sampleLrc);
  assert.equal(parsedCues.length, 2);
  assert.equal(parsedCues[0].time, 0.5);
  assert.equal(parsedCues[0].text, 'Primera línea');
  assert.equal(parsedCues[1].time, 2.3);
  assert.equal(parsedCues[1].text, 'Segunda línea');

  const sampleLrcBilingual = '[00:25.83] Ey, ahora todos quieren una colombiana^Hey, now everyone wants a Colombian girl\n[00:31.51] Una puertorriqueña, una venezolana^A Puerto Rican, a Venezuelan';
  const parsedBilingual = ottMusic.parseLrcToCues(sampleLrcBilingual);
  assert.equal(parsedBilingual.length, 2);
  assert.equal(parsedBilingual[0].text, 'Ey, ahora todos quieren una colombiana');
  assert.equal(parsedBilingual[1].text, 'Una puertorriqueña, una venezolana');

  assert.ok(html.includes('id="player-music-lyrics-box"'), 'ott/index.html debe incluir la caja de Karaoke para TV');
  assert.ok(html.includes('id="player-music-lyric-prev"'), 'ott/index.html debe incluir el elemento de línea previa');
  assert.ok(html.includes('id="player-music-lyric-active"'), 'ott/index.html debe incluir el elemento de línea activa ampliada');
  assert.ok(html.includes('id="player-music-lyric-next"'), 'ott/index.html debe incluir el elemento de línea siguiente');
  assert.ok(html.includes('id="player-music-lyric-next2"'), 'ott/index.html debe incluir el elemento de línea siguiente 2');
  assert.ok(html.includes('id="player-music-lyric-next3"'), 'ott/index.html debe incluir el elemento de línea siguiente 3');
  assert.ok(html.includes('function startLyricsTimer('), 'ott/index.html debe implementar temporizador de precisión startLyricsTimer');
  assert.ok(html.includes('function loadSongLyrics('), 'ott/index.html debe implementar loadSongLyrics');
  assert.ok(html.includes('function updateMusicLyrics('), 'ott/index.html debe implementar updateMusicLyrics');
  assert.ok(html.includes('function extractTrackInfo('), 'ott/index.html debe implementar extractTrackInfo');

  // Validar extractTrackInfo en VM con em-dash y query parameters
  const extractTrackStart = html.indexOf('function extractTrackInfo(');
  const extractTrackEnd = html.indexOf('function loadSongLyrics(');
  const extractCtx = {};
  vm.runInNewContext(html.slice(extractTrackStart, extractTrackEnd), extractCtx);
  const ext1 = extractCtx.extractTrackInfo({
    name: 'BbY WOW — KAROL G, Judeline & rusowsky',
    url: 'http://ott.teamg.store/api/ott/music/stream.mp4?artist=KAROL+G%2C+Judeline+%26+rusowsky&title=BbY+WOW'
  });
  assert.equal(ext1.title, 'BbY WOW');
  assert.equal(ext1.artist, 'KAROL G, Judeline & rusowsky');

  const ext2 = extractCtx.extractTrackInfo({
    name: 'BbY WOW — KAROL G, Judeline & rusowsky',
    url: ''
  });
  assert.equal(ext2.title, 'BbY WOW');
  assert.equal(ext2.artist, 'KAROL G, Judeline & rusowsky');

  // Validar que handleMusicLyrics es inmune a que le envíen la categoría en artist
  let mockStatus = 0, mockBody = '';
  await ottMusic.handleMusicLyrics(
    { method: 'GET', headers: {} },
    { writeHead(s) { mockStatus = s; }, end(b) { mockBody = b; } },
    '/api/ott/music/lyrics',
    { artist: '🔥 Más Escuchado', title: 'BbY WOW — KAROL G, Judeline & rusowsky' }
  );
  assert.equal(mockStatus, 200, 'handleMusicLyrics debe sanitizar categorías y responder 200 para BbY WOW');
  const parsedRes = JSON.parse(mockBody);
  assert.equal(parsedRes.ok, true);
  assert.equal(parsedRes.synced, true);
  assert.ok(Array.isArray(parsedRes.cues) && parsedRes.cues.length > 20);

  console.log('TeamG Music OTT integration unit tests pass.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
