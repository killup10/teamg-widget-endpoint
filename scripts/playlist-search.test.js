const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const ctx = {state: {channels: [
  {id: '1', name: 'El corazón', group: 'Drama'},
  {id: '2', name: 'Acción total', group: 'Estrenos'},
  {id: '3', name: 'Serie nueva', group: 'Series', isSeries: true}
], currentGroup: '__all', searchQuery: 'CORAZON', favorites: {}}};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function normalizePlaylistSearch('), html.indexOf('function getTileDimensions(')), ctx);
let result = ctx.getFilteredChannels();
assert.equal(result.length, 1); assert.equal(result[0].id, '1');
assert.equal(ctx.getFilteredChannels(), result, 'Reuse results between banner and rendering');
ctx.state.searchQuery = 'accion'; assert.equal(ctx.getFilteredChannels()[0].id, '2');
ctx.state.currentGroup = 'Drama'; assert.equal(ctx.getFilteredChannels().length, 0);
ctx.state.searchQuery = ''; ctx.state.currentGroup = '__fav';
assert.equal(ctx.getFilteredChannels().length, 0);
ctx.state.favorites['3'] = true; assert.equal(ctx.getFilteredChannels()[0].id, '3');
ctx.state.currentGroup = '__all'; ctx.state.channels = [{id: '4', name: 'Otro', group: 'Cine'}];
assert.equal(ctx.getFilteredChannels()[0].id, '4', 'Replacing a playlist invalidates results');
ctx.state.channels.push({id: '5', name: 'Serie', group: 'Series'});
// Search confirms once with OK and searches the complete playlist.
ctx.state.currentGroup = 'Cine'; ctx.kbInputText = 'Serie'; ctx.state.kbTargetField = 'search';
ctx.$ = () => ({style: {}});
for (const name of ['updateSearchBanner', 'renderChannels', 'renderTabs', 'updateSearchVisibility', 'updateTopBar', 'updateMainFocus']) ctx[name] = () => {};
vm.runInContext(html.slice(html.indexOf('function closeKeyboard('), html.indexOf('function closeKeyboard(') + html.slice(html.indexOf('function closeKeyboard(')).indexOf('\nfunction ')), ctx);
ctx.closeKeyboard(true);
assert.equal(ctx.state.currentGroup, '__all'); assert.equal(ctx.state.categoryConfirmed, true);
assert.equal(ctx.state.screen, 'playlists'); assert.equal(ctx.getFilteredChannels()[0].id, '5');
ctx.kbInputText = 'discarded'; ctx.closeKeyboard(false); assert.equal(ctx.state.searchQuery, 'Serie');
console.log('Playlist search: accents, result reuse, groups, favorites, catalog changes, OK and Cancel pass.');
