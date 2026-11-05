const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('ott/index.html', 'utf8');

// 1. Verify HTML template contains new options
assert.ok(html.includes('data-action="subcolor"'), 'Options must contain subcolor row');
assert.ok(html.includes('data-action="subsize"'), 'Options must contain subsize row');
assert.ok(html.includes('id="valSubColor"'), 'Options must contain valSubColor element');
assert.ok(html.includes('id="valSubSize"'), 'Options must contain valSubSize element');

// 2. Setup mock environment
const elements = {};
function element(id) {
  return elements[id] || (elements[id] = {
    id: id,
    style: {},
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    textContent: '',
    children: [],
    scrollTop: 0,
    clientHeight: 400,
    offsetHeight: 60,
    getBoundingClientRect() { return { top: 100, bottom: 160 }; },
    contains(child) { return true; }
  });
}

const ctx = {
  state: {
    auth: {},
    optIdx: 0,
    seriesArea: 'episodes',
    seriesEpIdx: 0,
    seriesActionIdx: 0,
    seriesSeasonIdx: 0,
    seriesSelectedSeason: 1
  },
  $: element,
  document: {
    body: element('body'),
    documentElement: { clientHeight: 1080 },
    getElementsByClassName: (cls) => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild: (el) => {} }
  },
  window: {},
  showToast: (m) => {},
  saveStorage: () => {},
  updateOptionsDisplay: () => {},
  detectedPlatform: () => 'NetCast',
  applyTheme: () => {}
};

vm.createContext(ctx);

function load(name) {
  const start = html.indexOf('function ' + name + '(');
  const end = html.indexOf('\nfunction ', start + 1);
  vm.runInContext(html.slice(start, end), ctx);
}

// Load definitions
const themesStart = html.indexOf('var OPT_THEMES =');
const subColorsEnd = html.indexOf('\nfunction applyTheme', themesStart);
vm.runInContext(html.slice(themesStart, subColorsEnd), ctx);
ctx.availableHlsEngines = () => ['JS player', 'Native HLS player'];
ctx.playerOptionLabel = (v) => v;

// Test OPT_SUB_COLORS and OPT_SUB_SIZES
assert.equal(ctx.OPT_SUB_COLORS.length, 4, '4 subtitle colors available');
assert.equal(ctx.OPT_SUB_SIZES.length, 4, '4 subtitle sizes available');

// Test applySubtitleStyles
ctx.state.auth.subColor = 'cyan';
ctx.state.auth.subSize = 'large';
ctx.applySubtitleStyles();

const subOverlay = element('player-subtitles-overlay');
assert.equal(subOverlay.style.color, '#00ffff', 'Subtitle color applied to overlay');
assert.equal(subOverlay.style.fontSize, '54px', 'Subtitle font-size applied to overlay');

// Test resetPlaybackPreferences
load('applyTextSize');
load('resetPlaybackPreferences');
ctx.resetPlaybackPreferences();
assert.equal(ctx.state.auth.subColor, 'yellow');
assert.equal(ctx.state.auth.subSize, 'normal');

// Test cycleOption for subcolor, subsize, and theme
load('cycleOption');
const optRows = [
  { getAttribute: (attr) => attr === 'data-action' ? 'subcolor' : null },
  { getAttribute: (attr) => attr === 'data-action' ? 'subsize' : null },
  { getAttribute: (attr) => attr === 'data-action' ? 'hlsplayer' : null },
  { getAttribute: (attr) => attr === 'data-action' ? 'theme' : null }
];
ctx.document.getElementsByClassName = (cls) => cls === 'opt-row' ? optRows : [];

ctx.state.auth.subColor = 'yellow';
ctx.cycleOption(0, 1);
assert.equal(ctx.state.auth.subColor, 'white', 'Cycled from yellow to white');
ctx.cycleOption(0, 1);
assert.equal(ctx.state.auth.subColor, 'cyan', 'Cycled from white to cyan');
ctx.cycleOption(0, -1);
assert.equal(ctx.state.auth.subColor, 'white', 'Cycled backwards to white');

ctx.state.auth.subSize = 'normal';
ctx.cycleOption(1, 1);
assert.equal(ctx.state.auth.subSize, 'large', 'Cycled from normal to large');
ctx.cycleOption(1, 1);
assert.equal(ctx.state.auth.subSize, 'xlarge', 'Cycled from large to xlarge');

// Ensure theme option cycles themes and does NOT collide with or touch hlsPlayer
ctx.state.auth.theme = 'wine';
ctx.state.auth.hlsPlayer = 'JS player';
ctx.cycleOption(3, 1);
assert.equal(ctx.state.auth.theme, 'dark', 'Cycled theme from wine to dark');
assert.equal(ctx.state.auth.hlsPlayer, 'JS player', 'hlsPlayer must remain untouched when cycling theme');

// And ensure cycling hlsplayer touches hlsPlayer and does NOT touch theme
ctx.cycleOption(2, 1);
assert.notEqual(ctx.state.auth.hlsPlayer, 'JS player', 'hlsPlayer cycled');
assert.equal(ctx.state.auth.theme, 'dark', 'theme must remain untouched when cycling hlsplayer');

// Test Series Detail Navigation free movement
load('getSeriesEpisodesColumns');
load('updateSeriesFocus');
load('safeScrollIntoView');
load('handleSeriesDetailNav');

// Load KEY constants
const keyStart = html.indexOf('var KEY = {');
const keyEnd = html.indexOf('};', keyStart) + 2;
vm.runInContext(html.slice(keyStart, keyEnd), ctx);
ctx.isBackKey = () => false;
ctx.isRedKey = () => false;
ctx.playSeriesEpisode = () => {};

// Mock a series with 5 episodes in a 2-column grid
const episodes = [
  { name: 'Ep 1', season: 1, episode: 1 },
  { name: 'Ep 2', season: 1, episode: 2 },
  { name: 'Ep 3', season: 1, episode: 3 },
  { name: 'Ep 4', season: 1, episode: 4 },
  { name: 'Ep 5', season: 1, episode: 5 }
];
ctx.state.currentSeries = {
  name: 'Test Series',
  seasonKeys: [1],
  seasons: { 1: episodes },
  episodes: episodes
};
ctx.state.seriesArea = 'episodes';
ctx.state.seriesEpIdx = 0;

// Test DOWN navigation in 2-column grid:
// Row 0: Ep 0, Ep 1
// Row 1: Ep 2, Ep 3
// Row 2: Ep 4

// From Ep 0, DOWN must go to Ep 2
ctx.handleSeriesDetailNav(ctx.KEY.DOWN, {});
assert.equal(ctx.state.seriesEpIdx, 2, 'DOWN from 0 moves to 2 (directly below)');

// From Ep 2, DOWN must go to Ep 4
ctx.handleSeriesDetailNav(ctx.KEY.DOWN, {});
assert.equal(ctx.state.seriesEpIdx, 4, 'DOWN from 2 moves to 4 (directly below)');

// From Ep 4, UP must go to Ep 2
ctx.handleSeriesDetailNav(ctx.KEY.UP, {});
assert.equal(ctx.state.seriesEpIdx, 2, 'UP from 4 moves to 2');

// From Ep 2, UP must go to Ep 0
ctx.handleSeriesDetailNav(ctx.KEY.UP, {});
assert.equal(ctx.state.seriesEpIdx, 0, 'UP from 2 moves to 0');

// From Ep 0, RIGHT moves to Ep 1
ctx.handleSeriesDetailNav(ctx.KEY.RIGHT, {});
assert.equal(ctx.state.seriesEpIdx, 1, 'RIGHT from 0 moves to 1');

// From Ep 1, DOWN moves to Ep 3
ctx.handleSeriesDetailNav(ctx.KEY.DOWN, {});
assert.equal(ctx.state.seriesEpIdx, 3, 'DOWN from 1 moves to 3');

// From Ep 3, DOWN jumps to last episode (Ep 4) even though Ep 5 does not exist
ctx.handleSeriesDetailNav(ctx.KEY.DOWN, {});
assert.equal(ctx.state.seriesEpIdx, 4, 'DOWN from 3 safely reaches last episode 4');

// From Ep 0, UP goes back to actions
ctx.state.seriesEpIdx = 0;
ctx.handleSeriesDetailNav(ctx.KEY.UP, {});
assert.equal(ctx.state.seriesArea, 'actions', 'UP from top row moves to actions');

// From actions, DOWN goes back to episodes
ctx.handleSeriesDetailNav(ctx.KEY.DOWN, {});
assert.equal(ctx.state.seriesArea, 'episodes', 'DOWN from actions moves back to episodes');
assert.equal(ctx.state.seriesEpIdx, 0, 'Focus is on episode 0');

console.log('Series navigation free movement and subtitle options tests passed successfully!');
