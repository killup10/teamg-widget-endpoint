const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('ott/index.html', 'utf8');

// 1. Verify DRAWER_PAGE_SIZE is defined as 8
assert.ok(html.includes('var DRAWER_PAGE_SIZE = 8;'), 'DRAWER_PAGE_SIZE must be strictly 8');

// 2. Extract renderDrawerList
const startIdx = html.indexOf('var DRAWER_PAGE_SIZE = 8;');
const endIdx = html.indexOf('function openChannelDrawer()', startIdx);
assert.ok(startIdx !== -1 && endIdx !== -1, 'renderDrawerList block must exist');

const source = html.slice(startIdx, endIdx);

// Mock a playlist with 24 episodes
const mockEpisodes = [];
for (let i = 1; i <= 24; i++) {
  mockEpisodes.push({ name: 'Episodio ' + i, episodeTitle: 'Episodio ' + i, episode: i, season: 1 });
}

let appendedRows = [];
const mockContainer = {
  innerHTML: '',
  appendChild: (frag) => {
    // Collect child divs
    if (frag && frag.children) {
      appendedRows = frag.children;
    }
  },
  querySelector: (sel) => {
    return appendedRows.find(r => r.className && r.className.includes('focused')) || null;
  }
};

const mockDoc = {
  createDocumentFragment: () => {
    const f = { children: [] };
    f.appendChild = (node) => f.children.push(node);
    return f;
  },
  createElement: (tag) => {
    return {
      className: '',
      attributes: {},
      innerHTML: '',
      setAttribute: function(k, v) { this.attributes[k] = v; },
      getAttribute: function(k) { return this.attributes[k]; }
    };
  }
};

const mockHeader = { innerHTML: '' };

const ctx = {
  document: mockDoc,
  state: {
    activeSeriesEpisodes: mockEpisodes,
    currentSeries: { id: 'test-series', name: 'Reencarnacion sin empleo' },
    drawerIdx: 0,
    currentGroup: '__all'
  },
  $: (id) => {
    if (id === 'player-drawer-list') return mockContainer;
    if (id === 'drawerGroupName') return mockHeader;
    return null;
  },
  resolveIconUrl: (u) => u || '',
  escapeHtml: (s) => s || ''
};

vm.createContext(ctx);
vm.runInContext(source, ctx);

// Test Page 0: exactly 8 rows rendered (indices 0 to 7)
ctx.renderDrawerList();
assert.equal(appendedRows.length, 8, 'Page 0 must render exactly 8 rows');
assert.equal(appendedRows[0].getAttribute('data-idx'), 0, 'First row should be index 0');
assert.equal(appendedRows[7].getAttribute('data-idx'), 7, 'Eighth row should be index 7');
assert.ok(appendedRows[0].className.includes('focused'), 'Index 0 must be focused');

// Test Page 1: when drawerIdx is 10 (Episodio 11)
ctx.state.drawerIdx = 10;
ctx.renderDrawerList();
assert.equal(appendedRows.length, 8, 'Page 1 must render exactly 8 rows');
assert.equal(appendedRows[0].getAttribute('data-idx'), 8, 'First row on page 1 should be index 8');
assert.equal(appendedRows[2].getAttribute('data-idx'), 10, 'Third row on page 1 should be index 10');
assert.ok(appendedRows[2].className.includes('focused'), 'Index 10 must be focused');

// Test Page 2: when drawerIdx is 23 (last episode)
ctx.state.drawerIdx = 23;
ctx.renderDrawerList();
assert.equal(appendedRows.length, 8, 'Page 2 must render exactly 8 rows');
assert.equal(appendedRows[0].getAttribute('data-idx'), 16, 'First row on page 2 should be index 16');
assert.equal(appendedRows[7].getAttribute('data-idx'), 23, 'Last row on page 2 should be index 23');
assert.ok(appendedRows[7].className.includes('focused'), 'Index 23 must be focused');

console.log('Player drawer 8-item pagination unit tests pass successfully.');
