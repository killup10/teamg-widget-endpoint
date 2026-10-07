const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const elements = {};
function element(id) { return elements[id] || (elements[id] = {style: {}, classList: {add() {}, remove() {}}, scrollTop: 0, clientHeight: 600, getBoundingClientRect() { return {top: 175, bottom: 775}; }}); }
const rows = Array.from({length: 9}, (_, i) => element('row' + i));
const keys = [element('key')];
const ctx = {state: {auth: {}, optIdx: 0}, $: element, document: {documentElement: {clientHeight: 1080}, querySelectorAll: () => keys, getElementsByClassName: () => rows}, window: {}, showToast() {}, saveStorage() {}, detectedPlatform: () => 'NetCast', fetchFeed() {}, renderPlaylistsView() {}, closeOptions() {}, loadPlaylistContent() {}};
vm.createContext(ctx);
function load(name) { const start = html.indexOf('function ' + name + '('); const end = html.indexOf('\nfunction ', start + 1); vm.runInContext(html.slice(start, end), ctx); }
element('topbar').offsetHeight = 175;
load('layoutSettings'); ctx.layoutSettings();
assert.equal(element('view-options').style.top, '175px');
assert.equal(keys[0].style.height, '103px');
ctx.document.documentElement.clientHeight = 720; element('topbar').offsetHeight = 117; ctx.layoutSettings();
assert.equal(element('view-options').style.top, '117px'); assert.equal(keys[0].style.height, '68px');
ctx.OPT_DESCRIPTIONS = []; load('updateOptionsFocus');
rows[0].getBoundingClientRect = () => ({top: 160, bottom: 206}); ctx.updateOptionsFocus();
assert.equal(element('view-options').scrollTop, -23, 'Focused login is scrolled below the HUD');
ctx.state.optIdx = 9; element('btnDoSave').getBoundingClientRect = () => ({top: 760, bottom: 820}); ctx.updateOptionsFocus();
assert.equal(element('view-options').scrollTop, 30, 'Bottom save button is kept visible');
load('doSaveAndLogin'); ctx.state.auth = {login: 'test', password: 'test'};
const pending = []; ctx.apiCall = (...args) => pending.push(args[3]);
ctx.doSaveAndLogin(); ctx.doSaveAndLogin(); assert.equal(pending.length, 1, 'Duplicate login is prevented');
pending.shift()(401, {}); assert.equal(ctx.state.loginBusy, false);
ctx.doSaveAndLogin(); pending.shift()(200, {ok: true, token: 'test'});
assert.equal(ctx.state.loginBusy, true); pending.shift()(0, null); assert.equal(ctx.state.loginBusy, false, 'Device timeout permits retry');
console.log('Settings: 720p/1080p HUD clearance, keyboard size, focus scrolling and login retry pass.');
