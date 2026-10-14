const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const cabinetHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'cabinet.html'), 'utf8');

// 1. Verify channel-name has min-width:0 to allow text truncation with ellipsis
assert.ok(
  cabinetHtml.includes('.channel-name{flex:1;min-width:0;'),
  'channel-name must include min-width:0 to prevent long titles from stretching the flex row'
);

// 2. Verify channel-name keeps text-overflow ellipsis
assert.ok(
  cabinetHtml.includes('overflow:hidden;text-overflow:ellipsis'),
  'channel-name must keep overflow:hidden and text-overflow:ellipsis'
);

// 3. Verify channel-actions has flex-shrink:0 and margin-left:auto
assert.ok(
  cabinetHtml.includes('.channel-actions{display:flex;gap:6px;flex-shrink:0;margin-left:auto}'),
  'channel-actions must have flex-shrink:0 and margin-left:auto to remain visible at the right edge'
);

// 4. Verify channel-btn has flex-shrink:0
assert.ok(
  cabinetHtml.includes('.channel-btn{flex-shrink:0;'),
  'channel-btn must have flex-shrink:0'
);

// 5. Verify editor-main and channels-container have min-width:0 and overflow-x:hidden
assert.ok(
  cabinetHtml.includes('.editor-main{flex:1;display:flex;flex-direction:column;min-width:0}'),
  'editor-main must have min-width:0'
);
assert.ok(
  cabinetHtml.includes('overflow-x:hidden'),
  'channels-container must have overflow-x:hidden to prevent horizontal page scrolling'
);

// 6. Verify channel-row has width:100% and min-width:0
assert.ok(
  cabinetHtml.includes('.channel-row{background:#22c55e;color:#fff;border-radius:4px;display:flex;align-items:center;padding:6px 12px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.15);cursor:grab;user-select:none;transition:transform 0.1s ease;box-sizing:border-box;width:100%;min-width:0}'),
  'channel-row must have width:100% and min-width:0'
);

console.log('Cabinet channel actions visibility and flex sizing unit tests pass successfully.');
