const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

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

// 5. Verify absolute positioning and back arrow visibility in playback overlay
assert.ok(
  html.includes('.player-top-right {') &&
  html.includes('position: absolute !important;') &&
  html.includes('right: 0.8vw !important;') &&
  html.includes('top: 1.7vh !important;'),
  'Player top-right controls must be absolutely positioned to prevent line drops and overscan clipping'
);

assert.ok(
  html.includes('id="btnPlayerClose"') &&
  html.includes('title="Volver (Retroceder)"') &&
  html.includes('polyline points="9 14 4 9 9 4"') &&
  html.includes('stroke-width="2.6"'),
  'btnPlayerClose must render the back arrow with high-visibility 2.6 stroke matching catalog return'
);

// 6. Verify forced app reload function and button bindings
assert.ok(
  html.includes('function reloadAppForce()') &&
  html.includes('cleanUrl + \'?v=\' + ts'),
  'reloadAppForce must exist to bust WebKit cache and force hard app reload on Smart TVs'
);

assert.ok(
  html.includes('data-action="reloadapp"') &&
  html.includes('Actualizar / Recargar app'),
  'view-options must provide explicit reload/update option row'
);

// 7. Verify version bumps to v2.5.53
assert.ok(html.includes('v2.5.53'), 'index.html must display version v2.5.53');
assert.ok(html.includes('native-player.js?v=2.5.53'), 'native-player.js query must be v2.5.53');
assert.ok(server.includes('logo-teamg.png?v=2.5.53'), 'server.js logo query must be v2.5.53');

// 8. Both playback overlays must auto-hide.
assert.ok(
  html.includes('player-overlay-bot') &&
  html.indexOf("botOv) botOv.style.display = 'none'") !== -1,
  'hidePlayerOverlay must hide the bottom bar'
);
assert.ok(
  html.indexOf("topOv) topOv.style.display = 'none'") !== -1,
  'hidePlayerOverlay must hide the top overlay'
);

const topOverlay = { style: { display: 'block' } };
const bottomOverlay = { style: { display: 'block' } };
const overlayContext = {
  state: { playerHudVisible: true, playerFocusedEl: null },
  $: id => id === 'player-overlay-top' ? topOverlay : bottomOverlay
};
const hideStart = html.indexOf('function hidePlayerOverlay()');
const hideEnd = html.indexOf('var lastChannelChangeTime', hideStart);
vm.runInNewContext(html.slice(hideStart, hideEnd) + '\nhidePlayerOverlay();', overlayContext);
assert.equal(topOverlay.style.display, 'none', 'Auto-hide must hide the top controls');
assert.equal(bottomOverlay.style.display, 'none');
assert.equal(overlayContext.state.playerHudVisible, false);

console.log('Player HUD action icons visual parity unit tests pass successfully.');
