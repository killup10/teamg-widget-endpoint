const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'ott', 'index.html'), 'utf8');

function extractBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.ok(start !== -1, 'Could not find startToken: ' + startToken);
  const end = source.indexOf(endToken, start);
  assert.ok(end !== -1, 'Could not find endToken: ' + endToken);
  return source.slice(start, end);
}

// 1. Test Player Progress Bar Navigation (Shaded -> OK to Select -> Move / Subida / Retroceso)
(function testProgressBarNavigation() {
  const elements = {};
  function makeEl(id) {
    const classes = new Set();
    return {
      id,
      style: { display: 'block', width: '0%', left: '0%' },
      textContent: '',
      clicked: 0,
      click() { this.clicked++; },
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); }
      }
    };
  }
  [
    'btnDrawerTrigger', 'btnSeekRewind', 'btnPlayPause', 'btnSeekForward',
    'playerProgressWrap', 'playerProgressBar',
    'btnPlayerRatio', 'btnPlayerEpg', 'btnPlayerAudio', 'btnPlayerSubs', 'btnPlayerClose',
    'player-overlay-top', 'player-overlay-bot',
    'player-epg-fill', 'player-epg-thumb', 'player-time-text',
    'video-el', 'netcast-player'
  ].forEach(id => { elements[id] = makeEl(id); });

  elements['video-el'].duration = 600;
  elements['video-el'].currentTime = 120;
  elements['netcast-player'].style.display = 'none';

  const toasts = [];
  const ctx = {
    window: {},
    document: { querySelector: () => elements['playerProgressWrap'] },
    KEY: { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, PLAY: 415, PAUSE: 19, STOP: 413 },
    state: {
      playerHudVisible: true,
      drawerOpen: false,
      playerArea: 'bottom',
      playerBotIdx: 2,
      playerTopIdx: 0,
      playerFocusedEl: null,
      progressSeekActive: false,
      progressSeekFrom: 0,
      progressSeekTarget: 0,
      activeDuration: 600,
      musicMode: false,
      musicYtActive: false
    },
    $: id => elements[id] || null,
    showToast: msg => toasts.push(msg),
    formatTime: s => {
      const sec = Math.max(0, Math.floor(s || 0));
      const m = Math.floor(sec / 60);
      const r = sec % 60;
      return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
    },
    updateProgressDisplay: () => {},
    updateMusicLyrics: () => {},
    getFilteredChannels: () => [{ id: '1', name: 'Pelicula 1' }],
    isDrawerVisible: () => false,
    openChannelDrawer: () => {},
    seekRelative: () => {},
    stopPlayer: () => {},
    isBackKey: kc => kc === 461,
    isYellowKey: () => false,
    isGreenKey: () => false,
    isRedKey: () => false,
    isBlueKey: () => false,
    clearTimeout: () => {},
    setTimeout: () => 1
  };
  ctx.window = ctx;

  const focusCode = extractBlock(html, 'function updatePlayerFocus()', 'var lastChannelChangeTime');
  const navCode = extractBlock(html, 'function handlePlayerNav(kc, eObj)', 'var DRAWER_PAGE_SIZE');
  const seekCode = extractBlock(html, 'function seekToPercent(pct)', "var optRows = document.getElementsByClassName('opt-row');");

  vm.runInNewContext([focusCode, navCode, seekCode].join('\n'), ctx);

  // Step A: UP from bottom controls shades the progress bar WITHOUT activating seek mode
  ctx.handlePlayerNav(ctx.KEY.UP, {});
  assert.strictEqual(ctx.state.playerArea, 'progress', 'UP from bottom must move focus to progress bar');
  assert.strictEqual(ctx.state.progressSeekActive, false, 'Progress bar must be shaded first, not seeking');
  assert.strictEqual(elements['playerProgressWrap'].classList.contains('focused'), true, 'Progress bar must have .focused class');
  assert.strictEqual(elements['playerProgressWrap'].classList.contains('seeking'), false, 'Progress bar must not have .seeking class before OK');

  // Step B: UP from shaded progress bar goes cleanly up ("subida") to top controls
  ctx.handlePlayerNav(ctx.KEY.UP, {});
  assert.strictEqual(ctx.state.playerArea, 'top', 'UP from shaded progress bar must go to top controls');
  assert.strictEqual(ctx.state.playerTopIdx, 0);
  assert.strictEqual(elements['btnPlayerRatio'].classList.contains('focused'), true);

  // Step C: DOWN from top controls shades the progress bar WITHOUT activating seek mode
  ctx.handlePlayerNav(ctx.KEY.DOWN, {});
  assert.strictEqual(ctx.state.playerArea, 'progress', 'DOWN from top must move focus to progress bar');
  assert.strictEqual(ctx.state.progressSeekActive, false, 'DOWN from top must keep progress bar shaded');

  // Step D: LEFT from shaded progress bar goes back ("retroceso") to btnSeekForward (bottom idx 3)
  ctx.handlePlayerNav(ctx.KEY.LEFT, {});
  assert.strictEqual(ctx.state.playerArea, 'bottom', 'LEFT from shaded progress bar must return to bottom controls');
  assert.strictEqual(ctx.state.playerBotIdx, 3, 'LEFT from shaded progress bar must focus btnSeekForward (idx 3)');

  // Step E: RIGHT from btnSeekForward shades the progress bar WITHOUT activating seek mode
  ctx.handlePlayerNav(ctx.KEY.RIGHT, {});
  assert.strictEqual(ctx.state.playerArea, 'progress', 'RIGHT from btnSeekForward must focus progress bar');
  assert.strictEqual(ctx.state.progressSeekActive, false, 'RIGHT from btnSeekForward must only shade progress bar');
  ctx.handlePlayerNav(ctx.KEY.RIGHT, {});
  assert.strictEqual(ctx.state.progressSeekActive, false, 'RIGHT on shaded progress bar must not activate seek mode');
  assert.strictEqual(toasts.length, 0, 'Shading or passing over progress bar must NEVER show any toast/menu before pressing OK');

  // Step F: Pressing OK (ENTER) on shaded progress bar selects it for movement
  ctx.handlePlayerNav(ctx.KEY.ENTER, {});
  assert.strictEqual(ctx.state.progressSeekActive, true, 'OK on shaded progress bar must activate seek mode');
  assert.strictEqual(elements['playerProgressWrap'].classList.contains('seeking'), true, 'Selected progress bar must have .seeking class');
  assert.strictEqual(ctx.state.progressSeekFrom, 120);
  assert.strictEqual(ctx.state.progressSeekTarget, 120);

  // Step G: Moving RIGHT (+30s) and LEFT (-30s / retroceso) updates progressSeekTarget
  ctx.handlePlayerNav(ctx.KEY.RIGHT, {});
  assert.strictEqual(ctx.state.progressSeekTarget, 150, 'RIGHT while selected must advance target by +30s');
  ctx.handlePlayerNav(ctx.KEY.LEFT, {});
  ctx.handlePlayerNav(ctx.KEY.LEFT, {});
  assert.strictEqual(ctx.state.progressSeekTarget, 90, 'LEFT while selected must rewind target by -30s each press');

  // Step H: Pressing BACK while selected cancels seek and keeps bar shaded
  ctx.handlePlayerNav(ctx.KEY.BACK, {});
  assert.strictEqual(ctx.state.progressSeekActive, false, 'BACK while seeking must cancel seek mode');
  assert.strictEqual(ctx.state.playerArea, 'progress', 'BACK while seeking must keep focus on shaded progress bar');
  assert.strictEqual(ctx.state.playerHudVisible, true, 'BACK while seeking must keep HUD open');
  assert.strictEqual(elements['video-el'].currentTime, 120, 'Cancelled seek must not alter video currentTime');

  // Step I: Pressing OK again, moving to 180s, and pressing OK confirms seek and returns to shaded state
  ctx.handlePlayerNav(ctx.KEY.ENTER, {});
  ctx.handlePlayerNav(ctx.KEY.RIGHT, {});
  ctx.handlePlayerNav(ctx.KEY.RIGHT, {});
  assert.strictEqual(ctx.state.progressSeekTarget, 180);
  ctx.handlePlayerNav(ctx.KEY.ENTER, {});
  assert.strictEqual(ctx.state.progressSeekActive, false, 'OK while seeking must confirm and exit seek mode');
  assert.strictEqual(elements['playerProgressWrap'].classList.contains('seeking'), false);
  assert.strictEqual(elements['video-el'].currentTime, 180, 'Confirmed seek must update video currentTime to target');
})();

// 2. Test Card Grid Caching (Same-View No-Op + Cross-View & NetCast Cache Restore)
(function testCardGridCaching() {
  const renderBlock = extractBlock(html, 'var PAGE_SIZE = 18;', 'function captureCatalogNavigation()');

  function createArea() {
    return {
      children: [],
      scrollTop: 0,
      innerHTMLClears: 0,
      get firstChild() { return this.children[0] || null; },
      set innerHTML(val) {
        if (val === '') {
          this.innerHTMLClears++;
          this.children = [];
        }
      },
      appendChild(node) {
        if (node && node.__isFragment) {
          while (node.children.length) {
            this.children.push(node.children.shift());
          }
        } else {
          this.children.push(node);
        }
        return node;
      },
      removeChild(node) {
        const idx = this.children.indexOf(node);
        if (idx !== -1) this.children.splice(idx, 1);
        return node;
      },
      querySelector(sel) {
        if (sel === 'img[data-music-src]') {
          return this.children.find(c => c.hasUnloadedImg) || null;
        }
        return null;
      }
    };
  }

  for (const useLegacyDevice of [false, true]) {
    const area = createArea();
    let imageLoaderStarts = 0;

    const channels = Array.from({ length: 25 }, (_, i) => ({
      id: 'ch_' + (i + 1),
      name: 'Canal ' + (i + 1),
      group: 'Peliculas',
      logo: 'http://example.com/p' + (i + 1) + '.jpg'
    }));

    const ctx = {
      window: {
        TeamGCatalogImages: {
          legacy: () => useLegacyDevice,
          thumbnail: u => u,
          stop: () => {},
          start(container) {
            imageLoaderStarts++;
            container.children.forEach(c => { c.hasUnloadedImg = false; });
          }
        }
      },
      PAGE_SIZE: 18,
      state: {
        currentPlaylist: { id: 'pl_1', name: 'Cine' },
        currentGroup: 'Peliculas',
        currentPage: 0,
        tileIdx: 0,
        searchQuery: '',
        favorites: {},
        channels,
        renderedChannelViewKey: '',
        renderedChannelViewCacheable: false
      },
      $: id => (id === 'content-area' ? area : { style: {}, textContent: '', innerHTML: '' }),
      getTabsList: () => [{ id: 'Peliculas', name: 'Peliculas', count: 25 }],
      document: {
        createDocumentFragment() {
          return {
            __isFragment: true,
            children: [],
            appendChild(n) {
              area.removeChild(n);
              this.children.push(n);
              return n;
            }
          };
        },
        createElement(tag) {
          return {
            tag,
            className: '',
            innerHTML: '',
            hasUnloadedImg: true,
            setAttribute(k, v) { this[k] = v; },
            appendChild() {}
          };
        }
      },
      getFilteredChannels: () => channels,
      normalizePlaylistSearch: q => String(q || '').trim().toLowerCase(),
      resolveIconUrl: u => u || '',
      fitChannelImage: () => {},
      escapeHtml: s => String(s || ''),
      updateMainFocus: () => {},
      updateTopBar: () => {}
    };

    vm.runInNewContext(renderBlock, ctx);

    // Initial render of Page 0
    ctx.renderChannels();
    assert.strictEqual(area.children.length, 18, 'Page 0 must render 18 cards');
    const firstCardRef = area.children[0];
    const clearsAfterFirstRender = area.innerHTMLClears;
    const loaderStartsAfterFirst = imageLoaderStarts;

    // Calling renderChannels() again with the SAME viewKey (e.g. pressing OK on category tab or closing Series Detail)
    ctx.renderChannels();
    assert.strictEqual(area.innerHTMLClears, clearsAfterFirstRender, 'Same viewKey must NOT clear area.innerHTML');
    assert.strictEqual(area.children[0], firstCardRef, 'Same viewKey must preserve the exact DOM card nodes');
    assert.strictEqual(imageLoaderStarts, loaderStartsAfterFirst, 'Same viewKey must NOT restart image loading');

    // Switch to Page 1
    ctx.state.currentPage = 1;
    ctx.renderChannels();
    assert.strictEqual(area.children.length, 7, 'Page 1 must render remaining 7 cards');

    // Return to Page 0 -> must restore from channelGridViewCache without recreating DOM nodes or reloading images
    ctx.state.currentPage = 0;
    ctx.renderChannels();
    assert.strictEqual(area.children.length, 18, 'Returning to Page 0 must restore 18 cards');
    assert.strictEqual(area.children[0], firstCardRef, 'Restored Page 0 must reuse cached DOM card nodes (useLegacyDevice=' + useLegacyDevice + ')');
    assert.strictEqual(imageLoaderStarts, 0, 'Regular playlists must render card <img src> directly without 2-by-2 music throttling');
  }
})();

// 3. Test Multi-Audio Track Detection & Switching (Japanese / English MKV + AVPlay + HTML5/NetCast)
(function testMultiAudioSwitching() {
  const audioMod = require('../android-audio');

  // Verify FFmpeg stderr parser for Japanese + English dual-audio MKV
  const sampleStderr = [
    "Input #0, matroska,webm, from 'http://teamg.store/anime.mkv':",
    "  Duration: 00:24:00.00, start: 0.000000, bitrate: 1800 kb/s",
    "  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 23.98 fps",
    "  Stream #0:1(jpn): Audio: aac (LC), 48000 Hz, stereo, fltp (default)",
    "    Metadata:",
    "      title           : Japanese",
    "  Stream #0:2(eng): Audio: aac (LC), 48000 Hz, stereo, fltp",
    "    Metadata:",
    "      title           : English"
  ].join('\n');

  const parsed = audioMod.parseAudioTracksFromStderr(sampleStderr);
  assert.strictEqual(parsed.duration, 1440, 'Must parse 24m duration from container header');
  assert.strictEqual(parsed.audioTracks.length, 2, 'Must detect both Japanese and English audio tracks');
  assert.strictEqual(parsed.audioTracks[0].label, 'Japonés');
  assert.strictEqual(parsed.audioTracks[1].label, 'Inglés');

  // Test client btnPlayerAudio switching (HTML5/NetCast server remux + Samsung AVPlay)
  const audioBtnBlock = extractBlock(html, 'function formatAudioLangLabel(', "$('btnPlayerSubs').onclick");
  const timelineBlock = extractBlock(html, 'function seekToPercent(pct)', "var optRows = document.getElementsByClassName('opt-row');");

  const toasts = [];
  const elements = {
    'btnPlayerAudio': {},
    'video-el': {
      style: { display: 'block' },
      currentTime: 125,
      duration: 1440,
      src: 'http://teamg.store/anime.mkv',
      loadCalls: 0,
      playCalls: 0,
      load() { this.loadCalls++; },
      play() { this.playCalls++; return { catch() {} }; }
    },
    'netcast-player': { style: { display: 'none' } },
    'player-epg-fill': { style: {} },
    'player-epg-thumb': { style: {} },
    'player-time-text': { textContent: '' }
  };

  let apiRequests = [];
  const ctx = {
    window: { location: { protocol: 'https:', host: 'ott.teamg.store' } },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/122.0' },
    document: { querySelector: () => null },
    API_BASE: 'https://ott.teamg.store',
    state: {
      screen: 'player',
      playerGeneration: 1,
      currentRawStreamUrl: 'http://teamg.store/anime.mkv',
      recoveryItem: { url: 'http://teamg.store/anime.mkv' },
      activeDuration: 1440,
      probedAudioTracks: [],
      selectedAudioTrackIdx: 0,
      audioRemuxOffset: 0,
      serverAudioTrackActive: false,
      audioProbePending: false,
      nativeAudioIndex: -1
    },
    $: id => elements[id] || null,
    showPlayerOverlay: () => {},
    showToast: msg => toasts.push(msg),
    formatTime: s => {
      const sec = Math.max(0, Math.floor(s || 0));
      const m = Math.floor(sec / 60);
      const r = sec % 60;
      return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
    },
    updateProgressDisplay: () => {},
    updateMusicLyrics: () => {},
    apiCall(method, url, body, cb) {
      apiRequests.push({ method, url });
      cb(200, {
        ok: true,
        duration: 1440,
        audioTracks: [
          { index: 0, lang: 'jpn', label: 'Japonés' },
          { index: 1, lang: 'eng', label: 'Inglés' }
        ]
      });
    }
  };
  ctx.window.TeamGNative = null;

  vm.runInNewContext([timelineBlock, audioBtnBlock].join('\n'), ctx);

  // 1st click on btnPlayerAudio when v.audioTracks is undefined:
  // Probes /api/ott/audio-tracks and immediately switches from Japanese (0) to English (1) at currentTime=125s
  elements['btnPlayerAudio'].onclick({});
  assert.strictEqual(apiRequests.length, 1, 'First click must probe /api/ott/audio-tracks');
  assert.strictEqual(ctx.state.selectedAudioTrackIdx, 1, 'Must switch to track index 1 (Inglés)');
  assert.strictEqual(ctx.state.serverAudioTrackActive, true, 'Server audio track remux must be active');
  assert.strictEqual(ctx.state.audioRemuxOffset, 125, 'Must preserve playback position offset (125s)');
  assert.ok(elements['video-el'].src.indexOf('audioTrack=1') !== -1 && elements['video-el'].src.indexOf('start=125') !== -1, 'Video src must load remuxed audioTrack=1 at start=125');
  assert.strictEqual(toasts[toasts.length - 1], '🔊 Audio: Inglés (2/2)');

  // Timeline with remux offset: when v.currentTime advances to 15s into remuxed stream, timeline.current is 125 + 15 = 140s
  elements['video-el'].currentTime = 15;
  assert.strictEqual(ctx.getProgressTimeline().current, 140, 'Timeline current time must include audioRemuxOffset');
  assert.strictEqual(ctx.getProgressTimeline().duration, 1440, 'Timeline duration must preserve full episode duration');

  // 2nd click on btnPlayerAudio: switches from English (1) back to Japanese (0) at 140s without re-probing
  elements['btnPlayerAudio'].onclick({});
  assert.strictEqual(apiRequests.length, 1, 'Second click must use cached probedAudioTracks without re-probing');
  assert.strictEqual(ctx.state.selectedAudioTrackIdx, 0, 'Second click must cycle back to track index 0 (Japonés)');
  assert.strictEqual(ctx.state.audioRemuxOffset, 140, 'Second click must start at updated position 140s');
  assert.strictEqual(toasts[toasts.length - 1], '🔊 Audio: Japonés (1/2)');

  // Test Samsung AVPlay native track switching on 1st press (switches to index 1 instead of staying on 0)
  const selectedNative = [];
  ctx.state.nativeAudioIndex = -1;
  ctx.window.TeamGNative = {
    active: () => true,
    tracks: () => [
      { type: 'AUDIO', index: '1', extra_info: '{"fourCC":"aac ","language":"jpn"}' },
      { type: 'AUDIO', index: '2', extra_info: '{"fourCC":"aac ","language":"eng"}' }
    ],
    select: (type, idx) => { selectedNative.push([type, idx]); return true; }
  };
  ctx.TeamGNative = ctx.window.TeamGNative;
  elements['btnPlayerAudio'].onclick({});
  assert.deepStrictEqual(selectedNative[0], ['AUDIO', '2'], 'First AVPlay audio press must switch to 2nd track (English), not re-select 1st track');
  assert.strictEqual(toasts[toasts.length - 1], '🔊 Audio TV: Inglés (2/2)');
})();

console.log('Progress bar navigation (shaded -> OK -> seek/up/back), card caching, and multi-audio switching tests pass.');
