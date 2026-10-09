const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('function refreshPlaylists()'), html.indexOf('function reloadAppForce()'));
const calls = [];
const pl = {id:'live'};
const ctx = {
  state: {auth:{token:'test'},currentPlaylist:pl,_playlistCache:{live:{},other:{}},_feedRetries:4},
  showToast:()=>{},
  loadPlaylistContent:(p,fresh)=>calls.push({p,fresh}),
  fetchFeed:()=>calls.push('feed'),
  reloadAppForce:()=>{throw new Error('Refresh must not reload app');},
  window:{location: new Proxy({}, {set(){throw new Error('Refresh must not navigate');}})}
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
ctx.refreshPlaylists();
assert.deepEqual(calls,[{p:pl,fresh:true}]);
assert.equal(ctx.state._playlistCache.live,undefined);
assert.ok(ctx.state._playlistCache.other);
calls.length=0;
ctx.state.currentPlaylist=null;
ctx.refreshPlaylists();
assert.deepEqual(calls,['feed']);
assert.equal(ctx.state._feedRetries,0);
calls.length=0;
ctx.state.auth.token='';
ctx.refreshPlaylists();
assert.equal(calls.length,0);
assert.ok(html.includes('bRefresh.onclick = refreshPlaylists;'));
assert.match(html,/if \(isRedKey\(kc, eObj\)\) \{\s*refreshPlaylists\(\);/);
console.log('Red remote key and refresh button update playlists without reloading the app.');
