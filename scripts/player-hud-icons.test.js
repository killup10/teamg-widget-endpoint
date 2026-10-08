const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('ott/index.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

// 1. Verify playback round-icon-btn has 7.5vh dimensions matching topbar
assert.ok(
  html.includes('.ott-action-col .round-icon-btn') &&
  html.includes('.player-top-right .round-icon-btn') &&
  html.includes('width: 7.5vh !important;') &&
  html.includes('height: 7.5vh !important;') &&
  html.includes('line-height: 7vh !important;'),
  'Playback buttons must match Home 7.5vh button size'
);

// 2. Verify playback SVG has 4.7vh scaling matching topbar
assert.ok(
  html.includes('.ott-action-col .round-icon-btn svg') &&
  html.includes('.player-top-right .round-icon-btn svg') &&
  html.includes('width: 4.7vh !important;') &&
  html.includes('height: 4.7vh !important;'),
  'Playback SVGs must match Home 4.7vh SVG size'
);

// 3. Verify spacing and accent underline parity
assert.ok(
  html.includes('.top-icon-group,') &&
  html.includes('.ott-action-col {') &&
  html.includes('margin-left: 1.2vw !important;'),
  'Playback action column spacing must match Home top-icon-group 1.2vw'
);

assert.ok(
  html.includes('.btn-color-accent,') &&
  html.includes('.action-underline {') &&
  html.includes('width: 5vw !important;') &&
  html.includes('height: 0.55vh !important;'),
  'Playback action underline must match Home 5vw width and 0.55vh height'
);

// 4. Verify focused polygon turns white
assert.ok(
  html.includes('.round-icon-btn.focused svg polygon') &&
  html.includes('fill: #ffffff !important;'),
  'Focused button SVG polygon must fill white'
);

// 5. Verify version bumps to v2.5.46
assert.ok(html.includes('v2.5.46'), 'index.html must display version v2.5.46');
assert.ok(html.includes('native-player.js?v=2.5.46'), 'native-player.js query must be v2.5.46');
assert.ok(server.includes('logo-teamg.png?v=2.5.46'), 'server.js logo query must be v2.5.46');

console.log('Player HUD action icons visual parity unit tests pass successfully.');
