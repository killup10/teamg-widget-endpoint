const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('ott/index.html', 'utf8');

// 1. Verify CSS styles for large readable titles and marquee support
assert.ok(html.includes('.tile-title {'), 'tile-title rule must exist');
assert.ok(html.includes('font-size: 2.6vh;'), 'tile-title must have large font size 2.6vh');
assert.ok(html.includes('height: 8.5vh;'), 'tile-title must have full height 8.5vh');
assert.ok(html.includes('.tile-item.has-marquee .tile-title'), 'has-marquee rule must exist');
assert.ok(html.includes('<span class="tile-title-text">'), 'title text must be wrapped in tile-title-text');

// 2. Extract and test marquee controller functions
const startIdx = html.indexOf('function stopMarquee(');
const endIdx = html.indexOf('function goBackAction()', startIdx);
assert.ok(startIdx !== -1 && endIdx !== -1, 'stopMarquee and startMarquee must be found');

const source = html.slice(startIdx, endIdx);

const classes1 = new Set(['tile-item']);
const style1 = {};
const textEl1 = { scrollWidth: 100, style: style1 };
const titleEl1 = { clientWidth: 200 }; // Fits comfortably (100 < 186)
const cardFits = {
  classList: {
    contains: n => classes1.has(n),
    add: n => classes1.add(n),
    remove: n => classes1.delete(n)
  },
  querySelector: sel => sel === '.tile-title' ? titleEl1 : (sel === '.tile-title-text' ? textEl1 : null)
};

const classes2 = new Set(['tile-item']);
const style2 = {};
const textEl2 = { scrollWidth: 350, style: style2 };
const titleEl2 = { clientWidth: 200 }; // Overflows (350 > 186)
const cardOverflows = {
  classList: {
    contains: n => classes2.has(n),
    add: n => classes2.add(n),
    remove: n => classes2.delete(n)
  },
  querySelector: sel => sel === '.tile-title' ? titleEl2 : (sel === '.tile-title-text' ? textEl2 : null)
};

const ctx = {
  state: { currentFocusedEl: null, _marqueeTimer: null },
  setTimeout: (fn, ms) => 12345,
  clearTimeout: id => {}
};

vm.createContext(ctx);
vm.runInContext(source, ctx);

assert.equal(typeof ctx.stopMarquee, 'function');
assert.equal(typeof ctx.startMarquee, 'function');

// Test: short title does NOT start marquee animation
ctx.state.currentFocusedEl = cardFits;
ctx.startMarquee(cardFits);
assert.ok(!classes1.has('has-marquee'), 'Short title should not have has-marquee');

// Test: long title starts marquee animation
ctx.state.currentFocusedEl = cardOverflows;
ctx.startMarquee(cardOverflows);
assert.ok(classes2.has('has-marquee'), 'Long title must receive has-marquee');
assert.ok(ctx.state._marqueeTimer !== null, 'Timer must be started for long title');

// Test: stopping marquee cleans up classes and styles
ctx.stopMarquee(cardOverflows);
assert.ok(!classes2.has('has-marquee'), 'Stopping marquee must remove has-marquee');
assert.equal(ctx.state._marqueeTimer, null, 'Stopping marquee must clear timer');
assert.equal(style2.transform, 'none', 'Transform must be reset to none');
assert.equal(style2.transition, 'none', 'Transition must be reset to none');

console.log('Tile marquee and large font tests pass successfully.');
