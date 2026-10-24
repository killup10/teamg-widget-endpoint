const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('ott/index.html','utf8');
const begin=html.indexOf("  var engine = state.auth.playerEngine || 'auto';",html.indexOf('  var needsProxy = false;'));
const source=html.slice(begin,html.indexOf('\nfunction startSamsungPlayer(',begin)).trim();
for(const engine of ['auto','mediaplayer']){
 for(const netcastObj of [{play(){}},{}]){
  const calls=[];const url='http://186.148.196.100:8000/play/a013';
  const ctx={state:{auth:{playerEngine:engine,token:'test'},currentPlaylist:{id:'list'},recoveryVod:false},
  window:{},netcastObj,v:{},isLegacyNetcast:true,isHls:false,isDirectCdn:false,ua:'Mozilla/5.0 NetCast/4.0',
  c:{url},streamUrl:url,playUrl:url,probeSubtitles(){},
  startNetcastPlayer:(v,obj,play)=>calls.push(play),playHtml5:()=>{throw Error('Wrong HTML5 route')},
  apiCall:()=>{throw Error('Native playback blocked by packaging')}
  };
  vm.runInNewContext('(function(){'+source+')()',ctx);
  assert.deepEqual(calls,[url],engine+': full startup path opens original HTTP URL immediately even before NPAPI layout');
 }
}
{
 const hlsUrl='http://38.199.5.160:8000/play/a0bi/index.m3u8';
 const proxyUrl='https://ott.teamg.store/api/ott/stream.m3u8?url='+encodeURIComponent(hlsUrl);
 const html5Calls=[];
 const ctx={state:{auth:{playerEngine:'auto',token:'test'},currentPlaylist:{id:'list'},recoveryVod:false},
 window:{},netcastObj:{},v:{},isLegacyNetcast:true,isHls:true,isDirectCdn:false,ua:'Mozilla/5.0 NetCast/4.0',
 c:{url:hlsUrl},streamUrl:hlsUrl,playUrl:proxyUrl,probeSubtitles(){},
 startNetcastPlayer:()=>{throw Error('Uninstantiated NPAPI must not intercept HLS')},
 playHtml5:(v,obj,play)=>html5Calls.push(play),
 apiCall:()=>{throw Error('Unexpected apiCall')}
 };
 vm.runInNewContext('(function(){'+source+')()',ctx);
 assert.deepEqual(html5Calls,[proxyUrl],'HLS stream on uninstantiated NetCast uses HTML5 with HTTPS proxy');
}
for(const engine of ['auto','mediaplayer']){
 for(const netcastObj of [{play(){}},{}]){
  const vodUrl='https://teamg.store/volvealos1726.mkv';
  const html5Calls=[];
  const ctx={state:{auth:{playerEngine:engine,token:'test'},currentPlaylist:{id:'cine'},recoveryVod:true},
  window:{},netcastObj,v:{},isLegacyNetcast:true,isHls:false,isDirectCdn:false,ua:'Mozilla/5.0 NetCast/4.0',
  c:{url:vodUrl},streamUrl:vodUrl,playUrl:vodUrl,probeSubtitles(){},
  startNetcastPlayer:()=>{throw Error('VOD MKV/MP4 must never instantiate NetCast NPAPI plugin')},
  playHtml5:(v,obj,play)=>html5Calls.push(play),
  apiCall:()=>{throw Error('Unexpected apiCall')}
  };
  vm.runInNewContext('(function(){'+source+')()',ctx);
  assert.deepEqual(html5Calls,[vodUrl],engine+': VOD movies on NetCast always use HTML5 video element');
 }
}
{
 const hlsUrl='http://38.199.5.160:8000/play/a0bi/index.m3u8';
 const proxyUrl='https://ott.teamg.store/api/ott/stream.m3u8?url='+encodeURIComponent(hlsUrl);
 const netcastSource=html.slice(html.indexOf('function startNetcastPlayer('),html.indexOf('function playHtml5('));
 const opened=[];
 const native={style:{},playState:0,stop(){},play(){opened.push(this.data);}};
 const ctx={
  state:{screen:'player',playerGeneration:1,recoveryVod:false},
  Date:class{getTime(){return 0;}},setInterval(){return 1;},clearInterval(){},hideTuning(){},showToast(){},
  $(){return{};},playHtml5(){opened.push('html5');}
 };
 vm.runInNewContext(netcastSource,ctx);
 ctx.startNetcastPlayer(null,native,proxyUrl,hlsUrl,{});
 assert.deepEqual(opened,[hlsUrl],'Active NetCast opens HTTP HLS directly instead of HTTPS proxy');
}
const samsungSource=html.slice(html.indexOf('function startSamsungPlayer('),html.indexOf('function startNetcastPlayer('));
{
 const direct='http://186.148.196.100:8000/play/a013';
 const proxy='https://ott.teamg.store/api/ott/stream.ts?url='+encodeURIComponent(direct);
 const calls=[];
 const ctx={
  state:{screen:'player',playerGeneration:1,recoveryVod:false},
  $(){return{style:{}};},
  hideTuning(){},showToast(){},setBuffering(){},recoverPlayback(){},
  TeamGNative:{start(url,cb){calls.push(url);cb.failed();}},
  playHtml5(){calls.push('html5');}
 };
 vm.runInNewContext(samsungSource,ctx);
 ctx.startSamsungPlayer({style:{}},{style:{}},proxy,direct,{});
 assert.deepEqual(calls,[direct,proxy,'html5'],'Samsung AVPlay must try direct HTTP first, then proxy, then HTML5');
}
console.log('NetCast and Samsung AVPlay live startup: both raw HTTP MPEG-TS (a013) and HTTP HLS (a0bi/index.m3u8) pass.');
