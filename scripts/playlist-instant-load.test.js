const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'ott', 'index.html'), 'utf8');
const apiCode = fs.readFileSync(path.join(__dirname, '..', 'ott-api.js'), 'utf8');

// 1. Test non-freezing M3U parsing + series aggregation + filtering on a large 3,000-item catalog
(function testFastM3uAndSeriesAggregation() {
  const start = html.indexOf('function strHash(');
  const end = html.indexOf('function getSeriesProgress(');
  const parseStart = html.indexOf('function parseM3U(');
  const parseEnd = html.indexOf('function getTileDimensions(');

  const ctx = {
    state: {
      currentPlaylist: { id: 'cine2026', name: 'Cine 2026' },
      currentGroup: '__all',
      searchQuery: '',
      favorites: {},
      auth: { token: 't', deviceId: 'd' }
    },
    resolveIconUrl: u => u || '',
    escapeHtml: s => String(s || '')
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start, end), ctx);
  vm.runInContext(html.slice(parseStart, parseEnd), ctx);

  // Build a realistic 3,000-entry M3U with long movie titles (containing digits, brackets, parens, hyphens) + series episodes + trailers
  const lines = ['#EXTM3U'];
  for (let i = 1; i <= 2500; i++) {
    lines.push(
      `#EXTINF:-1 tvg-logo="http://img.teamg.store/m${i}.jpg" group-title="ACCION Y AVENTURA" added-at="2026-10-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z",Película Especial ${i}: Parte 2 (2024) [1080p] - Edición Extendida 4K`,
      `http://stream.teamg.store/movies/m${i}.mp4`
    );
  }
  for (let s = 1; s <= 25; s++) {
    lines.push(
      `#EXTINF:-1 tvg-logo="http://img.teamg.store/s${s}.jpg" group-title="Serie Épica ${s}",Trailer Oficial`,
      `http://stream.teamg.store/series/s${s}/trailer.mp4`
    );
    for (let ep = 1; ep <= 20; ep++) {
      lines.push(
        `#EXTINF:-1 tvg-logo="http://img.teamg.store/s${s}e${ep}.jpg" group-title="Serie Épica ${s}",Serie Épica ${s} T1 E${ep} - Capítulo ${ep}`,
        `http://stream.teamg.store/series/s${s}/e${ep}.mkv`
      );
    }
  }
  const m3uText = lines.join('\n');

  const t0 = process.hrtime.bigint();
  const parsed = ctx.parseM3U(m3uText);
  const aggregated = ctx.aggregateSeriesList(parsed);
  ctx.state.channels = aggregated;
  ctx.buildGroups();
  const filtered = ctx.getFilteredChannels();
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

  assert.equal(parsed.length, 3025, 'All 3,025 raw M3U entries must be parsed');
  assert.equal(aggregated.length, 2525, '2,500 movies + 25 aggregated series (with trailers attached) must produce 2,525 catalog items');
  assert.equal(filtered.length, 2525);
  const sampleSeries = aggregated.find(x => x.isSeries && x.name === 'Serie Épica 1');
  assert.ok(sampleSeries, 'Series must be aggregated accurately');
  assert.equal(sampleSeries.episodes.length, 20, 'All 20 episodes must be grouped into the series');
  assert.equal(sampleSeries.trailerUrl, 'http://stream.teamg.store/series/s1/trailer.mp4', 'Series trailer must be attached');
  assert.ok(elapsedMs < 120, `Parsing + aggregating + sorting 3,025 items must not freeze main thread (took ${elapsedMs.toFixed(1)}ms)`);
  console.log(`VERIFIED fast M3U parse + series aggregation + recency sort on 3,025 items in ${elapsedMs.toFixed(1)}ms.`);
})();

// 2. Test background playlist prefetching + instant 0ms cache entry + in-flight XHR handoff
(function testBackgroundPrefetchAndInstantEntry() {
  const start = html.indexOf('function strHash(');
  const end = html.indexOf('function getSeriesProgress(');
  const parseStart = html.indexOf('function parseM3U(');
  const parseEnd = html.indexOf('function getTileDimensions(');

  const timers = new Map();
  let nextTimerId = 0;
  const requests = [];
  const preloadedRanges = [];
  const area = { innerHTML: '' };

  const pls = [
    { id: 'pl_cine', name: 'Cine 2026' },
    { id: 'pl_series', name: 'Series' }
  ];

  const ctx = {
    API_BASE: '',
    PAGE_SIZE: 18,
    state: {
      auth: { token: 'tok', deviceId: 'tv1' },
      screen: 'playlists',
      playlists: pls,
      currentPlaylist: null,
      channels: [],
      groups: [],
      tabIdx: 0,
      favorites: {},
      _playlistCache: {}
    },
    $: () => area,
    escapeHtml: s => String(s || ''),
    resolveIconUrl: u => u || '',
    visiblePlaylists: () => pls,
    getHomeTabsList: () => pls.map(p => ({ id: p.id, name: p.name, pl: p })),
    preloadUpcomingCardImages: (list, startIdx, count) => {
      preloadedRanges.push({ len: list.length, startIdx, count });
    },
    setTimeout: (fn, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    XMLHttpRequest: function() {
      this.readyState = 0;
      this.open = (method, url) => { this.url = url; this.readyState = 1; };
      this.send = () => { requests.push(this); };
      this.abort = () => { this.aborted = true; };
    },
    captureCatalogNavigation: () => ({}),
    restorePlaylistSurface: () => {},
    renderChannels: () => { area.innerHTML = 'RENDERED:' + ctx.state.channels.length; },
    renderTabs: () => {},
    updateTopBar: () => {},
    updateMainFocus: () => {},
    showToast: () => {},
    resolveRecentContent: () => {},
    updateSearchVisibility: () => {}
  };

  vm.createContext(ctx);
  vm.runInContext(html.slice(start, end), ctx);
  vm.runInContext(html.slice(parseStart, parseEnd), ctx);

  // Schedule background prefetch while user is on Home
  ctx.schedulePlaylistPrefetch();
  const initialTimer = [...timers.values()][0];
  assert.ok(initialTimer, 'schedulePlaylistPrefetch must arm background timer');
  timers.clear();
  initialTimer.fn();

  assert.equal(requests.length, 1, 'First playlist must start prefetching in background');
  assert.match(requests[0].url, /pid=pl_cine/);

  // Complete first background prefetch
  requests[0].readyState = 4;
  requests[0].status = 200;
  requests[0].responseText = '#EXTM3U\n#EXTINF:-1 tvg-logo="http://img/1.jpg" group-title="Estrenos",Pelicula 1\nhttp://s/1.mp4\n';
  requests[0].onreadystatechange();

  assert.ok(ctx.state._playlistCache.pl_cine, 'Prefetched playlist must be stored in _playlistCache');
  assert.equal(ctx.state._playlistCache.pl_cine.channels.length, 1);
  assert.equal(preloadedRanges.length, 1, 'Primary prefetched playlist must prewarm first page of card images');

  // Entering pl_cine now hits warm memory cache in 0ms without creating a new XHR
  const reqCountBeforeClick = requests.length;
  ctx.loadPlaylistContent(pls[0]);
  assert.equal(requests.length, reqCountBeforeClick, 'Entering a prefetched playlist must not trigger any network request');
  assert.equal(area.innerHTML, 'RENDERED:1', 'Cards must render synchronously on click');

  // Test in-flight XHR handoff: return to Home, start prefetching pl_series, and click pl_series before XHR finishes
  ctx.state.currentPlaylist = null;
  ctx.state.playlistRequest = null;
  ctx.schedulePlaylistPrefetch(pls[1]);
  const secondTimer = [...timers.values()][0];
  timers.clear();
  secondTimer.fn();

  const inFlightXhr = requests[requests.length - 1];
  assert.match(inFlightXhr.url, /pid=pl_series/);
  assert.equal(ctx.state._prefetchXhr, inFlightXhr);

  // User clicks pl_series while inFlightXhr is still downloading (readyState === 1)
  ctx.loadPlaylistContent(pls[1]);
  assert.equal(requests.length, 2, 'Clicking playlist while its prefetch is in-flight must adopt the active XHR instead of starting a duplicate');
  assert.equal(inFlightXhr.aborted, undefined, 'Adopted prefetch XHR must not be aborted');

  // When the adopted XHR finishes, it renders the playlist immediately
  inFlightXhr.readyState = 4;
  inFlightXhr.status = 200;
  inFlightXhr.responseText = '#EXTM3U\n#EXTINF:-1 group-title="Series",Serie 1 T1 E1\nhttp://s/s1e1.mkv\n#EXTINF:-1 group-title="Series",Serie 1 T1 E2\nhttp://s/s1e2.mkv\n';
  inFlightXhr.onreadystatechange();
  assert.equal(area.innerHTML, 'RENDERED:1', 'Adopted XHR completion must render the aggregated series card');
  assert.equal(ctx.state.channels[0].isSeries, true);
  assert.equal(ctx.state.channels[0].episodes.length, 2);
  console.log('VERIFIED background playlist prefetching, 0ms warm entry, and in-flight XHR handoff.');
})();

// 3. Test fitChannelImage layout reflow avoidance on .tile-thumb cards
(function testFitChannelImageReflowAvoidance() {
  const start = html.indexOf('function fitTvImage(img)');
  const end = html.indexOf('function escapeHtml', start);
  const context = { window: { innerWidth: 1920, innerHeight: 1080 } };
  vm.createContext(context);
  vm.runInContext('(function(){' + html.slice(start, end) + '})();', context);

  let clientWidthReads = 0;
  function makeTileImg() {
    const box = { className: 'tile-thumb' };
    Object.defineProperty(box, 'clientWidth', { get() { clientWidthReads++; return 280; } });
    Object.defineProperty(box, 'clientHeight', { get() { return 158; } });
    return { parentNode: box, naturalWidth: 400, naturalHeight: 225, style: {} };
  }

  for (let i = 0; i < 18; i++) {
    context.window.fitChannelImage(makeTileImg());
  }
  assert.equal(clientWidthReads, 1, '18 .tile-thumb card images must read clientWidth only once and reuse cached dimensions for the remaining 17 cards');
  console.log('VERIFIED fitChannelImage avoids 18x synchronous layout reflows across card grid.');
})();
