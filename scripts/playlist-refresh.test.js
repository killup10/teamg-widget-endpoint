const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('function refreshPlaylists()'), html.indexOf('function reloadAppForce()'));
const calls = [];
const clearedCacheIds = [];
const pl = {id:'live'};
const ctx = {
  state: {auth:{token:'test'},currentPlaylist:pl,_playlistCache:{live:{},other:{}},_feedRetries:4},
  showToast:()=>{},
  clearChannelGridViewCache:(id)=>clearedCacheIds.push(id),
  loadPlaylistContent:(p,fresh,onReady)=>{calls.push({p,fresh}); if (onReady) onReady();},
  fetchFeed:(fresh)=>calls.push(fresh ? 'feed-fresh' : 'feed'),
  openSeriesDetail:(s)=>calls.push({reopenedSeries:s.name}),
  reloadAppForce:()=>{throw new Error('Refresh must not reload app');},
  window:{location: new Proxy({}, {set(){throw new Error('Refresh must not navigate');}})}
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
ctx.refreshPlaylists();
assert.deepEqual(calls,[{p:pl,fresh:true}]);
assert.deepEqual(clearedCacheIds,['live']);
assert.equal(ctx.state._playlistCache.live,undefined);
assert.ok(ctx.state._playlistCache.other);

// Refresh while inside series-detail reopens the updated series automatically
calls.length=0;
clearedCacheIds.length=0;
ctx.state.screen='series-detail';
ctx.state.currentSeries={name:'Bleach',isSeries:true};
ctx.state.channels=[{name:'Bleach',isSeries:true,episodes:[1,2]}];
ctx.refreshPlaylists();
assert.deepEqual(calls,[{p:pl,fresh:true},{reopenedSeries:'Bleach'}]);

calls.length=0;
clearedCacheIds.length=0;
ctx.state.screen='playlists';
ctx.state.currentPlaylist=null;
ctx.refreshPlaylists();
assert.deepEqual(calls,['feed-fresh']);
assert.deepEqual(clearedCacheIds,[undefined]);
assert.deepEqual(Object.keys(ctx.state._playlistCache),[]);
assert.equal(ctx.state._feedRetries,0);
calls.length=0;
ctx.state.auth.token='';
ctx.refreshPlaylists();
assert.equal(calls.length,0);
assert.ok(html.includes('bRefresh.onclick = refreshPlaylists;'));
assert.match(html,/if \(isRedKey\(kc, eObj\)\) \{\s*refreshPlaylists\(\);/);
console.log('Red remote key and refresh button update playlists without reloading the app.');
