const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('ott/index.html', 'utf8');
const normalizedHtml = html.replace(/\r\n/g, '\n');
const server = fs.readFileSync('server.js', 'utf8');

// 1. Verify CSS styles for Home preview cards match catalog tile-item dimensions
assert.ok(html.includes('.tile-item { width: calc(16.666% - 0.4vw); height: 26.5vh;'), 'tile-item must define 26.5vh height');
assert.ok(html.includes('.tile-thumb { height: 17.5vh;'), 'tile-thumb must define 17.5vh height');
assert.ok(html.includes('.tile-title {') && html.includes('height: 8.5vh;'), 'tile-title must define 8.5vh height');
assert.ok(html.includes('.home-preview-row { width: 100%; white-space: nowrap; font-size: 0; }'), 'home-preview-row must have nowrap and font-size: 0');
assert.ok(!html.includes('height: 108px'), 'Hardcoded 108px height must not be present in home-preview styles');

// 2. Test renderHomeOverview generates tile-item markup
const startIdx = html.indexOf('function renderHomeOverview(area)');
const endIdx = html.indexOf('function restorePlaylistSurface()', startIdx);
assert.ok(startIdx !== -1 && endIdx !== -1, 'renderHomeOverview must exist in index.html');

const source = html.slice(startIdx, endIdx);

let renderedArea = { innerHTML: '' };
const mockState = {
  recentContent: [
    { title: 'Canal 1 HD', logo: 'http://example.com/logo1.png' },
    { title: 'Serie Genial', logo: 'http://example.com/logo2.png', seriesId: 's1', season: 1, episode: 5 }
  ]
};

const domElements = {};
const mockCtx = {
  state: mockState,
  escapeHtml: s => String(s || ''),
  resolveIconUrl: s => s,
  visiblePlaylists: () => [],
  getPlColor: () => null,
  getPlBadge: () => null,
  $: id => {
    if (!domElements[id]) domElements[id] = { style: {} };
    return domElements[id];
  }
};

vm.createContext(mockCtx);
vm.runInContext(source, mockCtx);
assert.equal(typeof mockCtx.renderHomeOverview, 'function');

mockCtx.renderHomeOverview(renderedArea);
const out = renderedArea.innerHTML;

assert.ok(out.includes('tile-item home-preview-card'), 'Rendered cards must have tile-item home-preview-card classes');
assert.ok(out.includes('<div class="tile-thumb">'), 'Cards must contain tile-thumb');
assert.ok(out.includes('<div class="tile-num">1</div>'), 'First card must have tile-num 1');
assert.ok(out.includes('<div class="tile-num">2</div>'), 'Second card must have tile-num 2');
assert.ok(out.includes('<div class="tile-title" title="Canal 1 HD"><span class="tile-title-text">Canal 1 HD</span></div>'), 'Card 1 must have tile-title with tile-title-text');
assert.ok(out.includes('Serie Genial · 1×5'), 'Card 2 series label formatted correctly');

// 3. Verify marquee is activated when currentFocusArea is 'recent'
assert.ok(
  html.includes("(state.currentFocusArea === 'content' || state.currentFocusArea === 'recent') && typeof startMarquee === 'function'"),
  'updateMainFocus must trigger startMarquee for both content and recent focus areas'
);

// 4. Verify vertical navigation from top into recent
assert.ok(
  normalizedHtml.includes("if (!isInside && (state.recentContent || []).length) {\n          state.currentFocusArea = 'recent';"),
  'Top DOWN navigation must target recent cards when on Home screen and recent cards exist'
);

// 5. Verify version bumps to v2.5.48
assert.ok(html.includes('v2.5.48'), 'index.html must display version v2.5.48');
assert.ok(html.includes('native-player.js?v=2.5.48'), 'native-player.js query must be v2.5.48');
assert.ok(server.includes('logo-teamg.png?v=2.5.48'), 'server.js logo query must be v2.5.48');

console.log('Home preview cards and navigation visual parity unit tests pass successfully.');
