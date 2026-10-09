const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ottHtml = fs.readFileSync(path.join(__dirname, '..', 'ott', 'index.html'), 'utf8');
const ottApi = fs.readFileSync(path.join(__dirname, '..', 'ott-api.js'), 'utf8');
const cabinetHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'cabinet.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin', 'index.html'), 'utf8');

// 1. Verify ott/index.html has isHalloweenPl gating getPlColor and getPlBadge
assert.ok(ottHtml.includes('function isHalloweenPl(pl)'), 'isHalloweenPl function must exist in ott/index.html');
assert.ok(ottHtml.includes('if (!isHalloweenPl(pl)) return \'\';'), 'getPlColor and getPlBadge must be guarded by isHalloweenPl');

// Extract and evaluate helper functions in isolated context
const evalContext = {};
const fnCode = `
${ottHtml.slice(ottHtml.indexOf('function isHalloweenPl('), ottHtml.indexOf('function visiblePlaylists()'))}
return { isHalloweenPl, getPlColor, getPlBadge };
`;
const helpers = new Function(fnCode)();

const docPl = { name: 'documentales', color: '#ff6a00', badge: '' };
const teamgPl = { name: 'TeamG Gplay', color: '#ff6a00', badge: 'VIP' };
const hwPl1 = { name: '🎃 Halloween', color: '#ff6a00', badge: 'HALLOWEEN' };
const hwPl2 = { name: 'Terror Halloween 2026', color: '', badge: '' };
const hwPl3 = { name: 'Especial Noviembre', color: '#ff6a00', badge: 'HALLOWEEN' };

// Non-Halloween playlists MUST return empty color and empty badge
assert.strictEqual(helpers.isHalloweenPl(docPl), false, 'documentales is not Halloween');
assert.strictEqual(helpers.getPlColor(docPl), '', 'documentales must have empty color (no orange)');
assert.strictEqual(helpers.getPlBadge(docPl), '', 'documentales must have empty badge');

assert.strictEqual(helpers.isHalloweenPl(teamgPl), false, 'TeamG Gplay is not Halloween');
assert.strictEqual(helpers.getPlColor(teamgPl), '', 'TeamG Gplay must have empty color');
assert.strictEqual(helpers.getPlBadge(teamgPl), '', 'TeamG Gplay must have empty badge');

// Halloween playlists MUST return orange and Halloween badge
assert.strictEqual(helpers.isHalloweenPl(hwPl1), true, '🎃 Halloween is Halloween');
assert.strictEqual(helpers.getPlColor(hwPl1), '#ff6a00', '🎃 Halloween must have #ff6a00 color');
assert.strictEqual(helpers.getPlBadge(hwPl1), 'HALLOWEEN', '🎃 Halloween must have HALLOWEEN badge');

assert.strictEqual(helpers.isHalloweenPl(hwPl2), true, 'Terror Halloween 2026 is Halloween');
assert.strictEqual(helpers.getPlColor(hwPl2), '#ff6a00', 'Terror Halloween 2026 must default to #ff6a00 color');
assert.strictEqual(helpers.getPlBadge(hwPl2), 'HALLOWEEN', 'Terror Halloween 2026 must default to HALLOWEEN badge');

assert.strictEqual(helpers.isHalloweenPl(hwPl3), true, 'Badge HALLOWEEN marks playlist as Halloween');
assert.strictEqual(helpers.getPlColor(hwPl3), '#ff6a00', 'Halloween badge gives #ff6a00');
assert.strictEqual(helpers.getPlBadge(hwPl3), 'HALLOWEEN', 'Halloween badge is preserved');

// 2. Verify renderTabs fast-path clears residual styles
assert.ok(
  ottHtml.includes("else { try { bar.children[k].style.background = ''; bar.children[k].style.borderRight = ''; } catch (e) {} }"),
  'renderTabs must clear residual styles on non-Halloween tabs'
);

// 3. Verify ott-api.js logic filters color and badge for non-Halloween playlists
assert.ok(ottApi.includes('isHalloween'), 'ott-api.js must have isHalloween checker');
assert.ok(ottApi.includes("if (!isHw) {\n    if (color === HALLOWEEN_ORANGE || color === '#ff6a00') color = '';"), 'ott-api.js pub(p) must strip orange from non-Halloween');

// 4. Verify web/cabinet.html and admin/index.html do not force #ff6a00 by default
assert.ok(!cabinetHtml.includes("id='pc' type='color' value='#ff6a00'"), 'cabinet.html must not hardcode #ff6a00 color input');
assert.ok(cabinetHtml.includes("id='pc' type='hidden' value=''"), 'cabinet.html pc input must default to empty');
assert.ok(!adminHtml.includes('id="pc" type="color" value="#ff6a00"'), 'admin/index.html must not hardcode #ff6a00 color input');
assert.ok(adminHtml.includes('id="pc" type="hidden" value=""'), 'admin/index.html pc input must default to empty');

console.log('Halloween exclusivity unit tests pass successfully.');
