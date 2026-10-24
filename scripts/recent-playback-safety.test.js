const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const chatran = {id:'c_2', name:'Las aventuras de Chatran', group:'Familia', url:'http://example.com/chatran.mp4'};
const other = {id:'c_1', name:'Rescate imposible', group:'Accion', url:'http://example.com/rescate.mp4', addedAt:'2026-10-24'};
let played, toast;
const ctx = {
  state: {channels:[chatran,other], currentPlaylist:{id:'cine',name:'Cine por Genero'}, currentGroup:'Accion', searchQuery:'rescate', auth:{}},
  normalizePlaylistSearch:s=>String(s||'').toLowerCase(), PAGE_SIZE:18,
  renderChannels(){}, renderTabs(){}, updateMainFocus(){}, playItem:c=>played=c,
  playChannelAt(){throw Error('Recent must never dispatch a raw catalog index');},
  showToast:s=>toast=s, localStorage:{setItem(){}},
};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function getFilteredChannels('),html.indexOf('function getTileDimensions(')),ctx);
vm.runInContext(html.slice(html.indexOf('function rememberRecentContent('),html.indexOf('function renderHomeOverview(')),ctx);
// Old history lacks URL and carries stale IDs; date ordering also changes indices.
ctx.state.pendingRecentContent={id:'old-id',name:chatran.name,playlistId:'cine'};
ctx.resolveRecentContent();
assert.equal(played,chatran);
assert.equal(ctx.state.currentChannelIdx,1);
assert.equal(ctx.state.currentGroup,'__all');
assert.equal(ctx.state.searchQuery,'');
ctx.rememberRecentContent(chatran);
assert.equal(ctx.state.recentContent[0].url,chatran.url);
assert.equal(ctx.state.recentContent[0].group,chatran.group);
ctx.state.currentPlaylist={id:'__music',name:'🎵 TeamG Music',isMusic:true};
ctx.rememberRecentContent({id:'m_1',name:'Cancion Test',url:'/api/ott/music/stream.mp4?id=1'});
assert.equal(ctx.state.recentContent.length,1,'TeamG Music tracks must never be added to recentContent');
assert.equal(ctx.state.recentContent[0].name,chatran.name);
ctx.state.currentPlaylist={id:'cine',name:'Cine por Genero'};

// Auto-advance to the next movie when a VOD movie finishes.
let advancedIdx = -1;
const vodAdvCtx = {
  state: {
    recoveryVod: true,
    currentPlaylist: { id: 'cine', name: 'Cine por Genero' },
    currentChannelIdx: 0,
    recoveryItem: other,
    _advancingVod: false
  },
  PAGE_SIZE: 18,
  lastChannelChangeTime: 500,
  setTimeout: fn => fn(),
  getFilteredChannels: () => [other, chatran],
  playChannelAt: idx => { advancedIdx = idx; },
  stopPlayer: () => {}
};
vm.runInNewContext(html.slice(html.indexOf('function isMusicPlaying()'), html.indexOf('function extractTrackInfo(')), vodAdvCtx);
vodAdvCtx.advanceVodContent();
assert.equal(advancedIdx, 1, 'Finishing a VOD movie must automatically play the next movie in the catalog');
played=null;
ctx.state.channels=[other];
ctx.state.pendingRecentContent={id:'c_1',name:chatran.name,url:chatran.url};
ctx.resolveRecentContent();
assert.equal(played,null,'Missing movies must not open a different title');
assert.ok(toast);

// Cleanup releases both engines without setting the HTML5 source to the app page.
const calls=[];
const video={getAttribute:()=> 'old.mp4',removeAttribute:k=>calls.push('remove:'+k),load:()=>calls.push('load'),pause(){},style:{}};
const native={stop:()=>calls.push('stop-native'),data:'old.mp4',style:{}};
const clean={state:{auth:{}}, window:{}, $:id=>id==='video-el'?video:id==='netcast-player'?native:null,
  destroyYtPlayer(){},stopLyricsTimer(){},hideTuning(){},stopPlaybackTicker(){},clearTimeout(){},clearInterval(){}};
vm.createContext(clean);
vm.runInContext(html.slice(html.indexOf('function cleanPlayerEngines('),html.indexOf('function formatTime(')),clean);
clean.cleanPlayerEngines();
assert.ok(calls.indexOf('remove:src') < calls.indexOf('load'));
assert.ok(calls.indexOf('stop-native') !== -1, 'Native stop must be called to release decoder');
assert.equal(native.data, 'old.mp4', 'Never wipe data with empty string which crashes NetCast WebKit');
assert.equal(video.src,undefined);
assert.equal(native.onPlayStateChange,null);

// A held BACK can close the player only once, including NetCast without repeat flags.
let backActions=0, timer;
const keys={state:{screen:'player'},window:{},KEY:{},isBackKey:k=>k===461,isDrawerVisible:()=>false,
  handlePlayerNav:()=>{backActions++;keys.state.screen='playlists';},handleMainNav:()=>backActions++,
  setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}};
vm.createContext(keys);
vm.runInContext('var lastKeyCode=0,lastKeyTime=0;'+html.slice(html.indexOf('function onGlobalKeyDown('),html.indexOf('if (document.addEventListener)',html.indexOf('function onGlobalKeyDown('))),keys);
const event={keyCode:461,preventDefault(){},stopPropagation(){}};
keys.onGlobalKeyDown(event);
keys.onGlobalKeyDown(event);
assert.equal(backActions,1);
timer();
assert.equal(keys.state.backKeyHeld,false);
console.log('Recent movie identity, sorted playback, decoder cleanup and held BACK safety pass.');
