const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const api = fs.readFileSync('ott-api.js', 'utf8');
const html = fs.readFileSync('ott/index.html', 'utf8');
const ctx = {state: {currentPlaylist: {name: 'Cine 2026'}, currentGroup: '__all', channels: [
  {name:'Comedia vieja',group:'COMEDIA'},
  {name:'Drama nuevo',group:'DRAMA',addedAt:'2026-10-19T18:00:00Z'},
  {name:'Comedia anterior',group:'COMEDIA',addedAt:'2026-10-18T18:00:00Z'}
]}, normalizePlaylistSearch:s=>String(s||'').toLowerCase()};
vm.createContext(ctx);
vm.runInContext(api.slice(api.indexOf('function parseM3uText('),api.indexOf('function serializeChannelsToM3u(')),ctx);
vm.runInContext(html.slice(html.indexOf('function getFilteredChannels('),html.indexOf('function getTileDimensions(')),ctx);
for (const name of ['Cine 2026','Cine 4K','Cine por generos','Cine por Genero','Cine 4K UHD']) {
  ctx.state.currentPlaylist.name=name; ctx.state._filteredChannels=null;
  assert.equal(ctx.getFilteredChannels()[0].name,'Drama nuevo');
}
ctx.state.currentGroup='COMEDIA';
assert.equal(ctx.getFilteredChannels()[0].name,'Comedia vieja');
ctx.state.currentGroup='__all';ctx.state.currentPlaylist.name='TV';ctx.state._filteredChannels=null;
assert.equal(ctx.getFilteredChannels()[0].name,'Comedia vieja');
const parsed=ctx.parseM3uText('#EXTM3U\n#EXTINF:-1 added-at="2026-10-19T18:00:00Z",Nuevo\nhttp://test/new');
assert.equal(parsed.channels[0].addedAt,'2026-10-19T18:00:00Z');
const merged=ctx.mergePlaylistSource(parsed.channels,[{name:'Otro',url:'http://test/other',group:'Drama'}]);
assert.ok(merged.channels.find(c=>c.name==='Otro').addedAt);
assert.equal(merged.channels.find(c=>c.name==='Nuevo').addedAt,'2026-10-19T18:00:00Z');
ctx.state.channels=merged.channels;ctx.state.currentGroup='__all';
for (const name of ['Cine 2026','Cine 4K','Cine por generos']) {
  ctx.state.currentPlaylist.name=name;ctx.state._filteredChannels=null;
  assert.equal(ctx.getFilteredChannels()[0].name,'Otro','New movies still lead Todos after source sync');
}
console.log('Movie recency: all three catalogs, genre order, live TV, M3U dates and sync preservation pass.');
