const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('function startPlayerHeartbeat()'), html.indexOf('function playChannelAt('));
function setup() {
  let tick, reply, requests = 0, stops = 0, saved = 0, options = 0;
  const state = {screen:'player', playerGeneration:7, auth:{token:'token',deviceId:'tv',login:'user',password:'password'}, channels:[1],playlists:[1],_playlistCache:{cached:true},currentSeries:{},activeSeriesEpisodes:[1]};
  const env = {state, setInterval(fn, ms){assert.equal(ms,120000);tick=fn;return 1;},clearInterval(){tick=null;},apiCall(method,url,body,cb){requests++;reply=cb;}, stopPlayer(){stops++;env.stopPlayerHeartbeat();state.playerGeneration++;state.screen='playlists';},saveStorage(){saved++;},renderPlaylistsView(){assert.equal(state.channels.length,0);},openOptions(){options++;state.screen='options';},showToast(){}};
  vm.createContext(env);vm.runInContext(source,env);env.startPlayerHeartbeat();
  return {state,env,tick:()=>tick(),reply:(s,r)=>reply(s,r),get requests(){return requests;},get stops(){return stops;},get saved(){return saved;},get options(){return options;}};
}
for (const error of ['no-device','blocked','no-user','no-auth']) {
  const t=setup();t.tick();t.tick();assert.equal(t.requests,1,'No overlapping checks');
  t.reply(401,{ok:false,error});assert.equal(t.stops,1);assert.equal(t.saved,1);assert.equal(t.options,1);assert.equal(t.state.auth.token,'');assert.equal(t.state.auth.password,'');assert.equal(t.state.playlists.length,0);assert.equal(t.state.currentPlaylist,null);
}
for(const [status,result] of [[0,null],[500,{ok:false,error:'no-device'}],[200,{ok:true}],[401,null],[401,{ok:false,error:'unknown'}]]) {
 const t=setup();t.tick();t.reply(status,result);assert.equal(t.stops,0);t.tick();assert.equal(t.requests,2);
}
for(const change of [t=>t.state.playerGeneration++,t=>t.state.screen='playlists',t=>t.state.auth.token='new',t=>t.state.auth.deviceId='other']) {
 const t=setup();t.tick();change(t);t.reply(401,{ok:false,error:'no-device'});assert.equal(t.stops,0,'Stale checks cannot revoke another playback/session');
}
console.log('Playback revocation: 2-minute checks, confirmed denial, transient errors, overlap and stale-session guards pass.');
