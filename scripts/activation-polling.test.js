const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const html=fs.readFileSync('ott/index.html','utf8');
const source=html.slice(html.indexOf('function startActivationPolling()'),html.indexOf('function openOptions()'));
function setup(screen='playlists') {
 let tick,reply,requests=0,loaded=0,saved=0;
 const state={screen,activationCode:'123-456',auth:{deviceId:'second-tv',token:'',password:'old-password',pendingActivationCode:'123-456'}};
 const env={state,Date,encodeURIComponent,setInterval(fn){tick=fn;return 1;},clearInterval(){tick=null;},setTimeout(fn){fn();},apiCall(method,url,body,cb){requests++;reply=cb;},$:()=>({style:{}}),showToast(){},saveStorage(){saved++;},updateOptionsDisplay(){},closeOptions(){state.screen='playlists';},loadPlaylistContent(){loaded++;},renderPlaylistsView(){loaded++;},fetchFeed(){loaded++;}};
 vm.createContext(env);vm.runInContext(source,env);env.startActivationPolling();
 return{state,tick:()=>tick&&tick(),reply:r=>reply(200,r),get requests(){return requests;},get loaded(){return loaded;},get saved(){return saved;}};
}
const response={ok:true,activated:true,token:'new-token',user:{login:'shared-user'},playlists:[{id:'one'}]};
for(const screen of ['options','playlists']){
 const t=setup(screen);t.tick();assert.equal(t.requests,1,'Must poll from Home without a token');t.tick();assert.equal(t.requests,1,'No overlapping checks');t.reply(response);assert.equal(t.state.auth.token,'new-token');assert.equal(t.state.auth.login,'shared-user');assert.equal(t.state.auth.password,'');assert.equal(t.state.auth.pendingActivationCode,undefined);assert.equal(t.loaded,1);assert.equal(t.saved,1);
}
const stale=setup();stale.tick();stale.state.activationCode='654-321';stale.reply(response);assert.equal(stale.state.auth.token,'');
const linked=setup();linked.state.auth.token='existing-token';linked.tick();assert.equal(linked.requests,0,'Do not silently switch a linked account outside Settings');
const invalid=setup();invalid.tick();invalid.reply({...response,token:''});assert.equal(invalid.loaded,0);
console.log('Activation polling from Home/Settings, credentials, lists, overlap and stale response guards pass.');
