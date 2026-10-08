const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('ott/index.html', 'utf8');
const apiCode = fs.readFileSync('ott-api.js', 'utf8');

// 1. Verify fitTvImage logic with vm
const start = html.indexOf('function fitTvImage(img)');
const end = html.indexOf('function escapeHtml', start);
const context = { window: {} };
vm.createContext(context);
vm.runInContext('(function(){' + html.slice(start, end) + '})();', context);

// Test A: 16:9 image inside a 2:3 vertical box (like Series Detail 300x440)
// MUST NOT STRETCH to 100% x 100%
const img169InVertical = {
  parentNode: { clientWidth: 300, clientHeight: 440 },
  naturalWidth: 400,
  naturalHeight: 225,
  style: {}
};
context.window.fitTvImage(img169InVertical);
assert.notEqual(img169InVertical.style.height, '100%', '16:9 image must NOT stretch to 100% height of vertical box');
assert.equal(img169InVertical.style.width, '300px');
assert.equal(img169InVertical.style.height, '169px');
assert.equal(img169InVertical.style.left, '0px');
assert.equal(img169InVertical.style.top, '136px');

// Test B: 2:3 vertical poster in 300x440 box
const img23InVertical = {
  parentNode: { clientWidth: 300, clientHeight: 440 },
  naturalWidth: 300,
  naturalHeight: 450,
  style: {}
};
context.window.fitTvImage(img23InVertical);
assert.equal(img23InVertical.style.width, '100%', '2:3 poster matching box ratio should fill 100%');
assert.equal(img23InVertical.style.height, '100%');

// Test C: 16:9 image in 16:9 horizontal box (e.g. 300x200) fast-path
const img169InHorizontal = {
  parentNode: { clientWidth: 300, clientHeight: 200 },
  naturalWidth: 400,
  naturalHeight: 225,
  style: {}
};
context.window.fitTvImage(img169InHorizontal);
assert.equal(img169InHorizontal.style.width, '100%');
assert.equal(img169InHorizontal.style.height, '100%');

// 2. CSS integrity checks
assert.ok(html.includes('.series-poster-box {'), 'series-poster-box rule must exist');
assert.ok(html.includes('object-fit: contain;'), 'series-poster-box img must use object-fit: contain');
assert.ok(html.includes('max-width: 300px;'), 'series-poster-box must have max-width: 300px');

// 3. M3U poster regex support
assert.ok(html.includes('(?:series-poster|tvg-poster|poster|tvg-cover)='), 'parseM3U must support all poster tags');
assert.ok(apiCode.includes('(?:series-poster|tvg-poster|poster|tvg-cover)='), 'ott-api.js must support all poster tags');

console.log('Series poster fit and proportional rendering tests pass successfully.');
