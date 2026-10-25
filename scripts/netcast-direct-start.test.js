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
  const netcastCalls=[];
  const apiCalls=[];
  const ctx={state:{screen:'player',playerGeneration:1,auth:{playerEngine:engine,token:'test'},currentPlaylist:{id:'cine'},recoveryVod:true},
  window:{},API_BASE:'https://ott.teamg.store',netcastObj,v:{},isLegacyNetcast:true,isHls:false,isDirectCdn:false,ua:'Mozilla/5.0 NetCast/4.0',
  c:{url:vodUrl},streamUrl:vodUrl,playUrl:vodUrl,probeSubtitles(){},
  startNetcastPlayer:(v,obj,play)=>netcastCalls.push(play),
  playHtml5:(v,obj,play)=>html5Calls.push(play),
  apiCall:(method,path,body,callback)=>{apiCalls.push(path);callback(200,{ok:true,sessionId:'a'.repeat(48),url:'/api/ott/vod-hls/'+'a'.repeat(48)+'/index.m3u8'});}
  };
  vm.runInNewContext('(function(){'+source+')()',ctx);
  const normalized='https://ott.teamg.store/api/ott/vod-hls/'+'a'.repeat(48)+'/index.m3u8';
  assert.deepEqual(apiCalls,['/api/ott/vod-hls/prepare'],'MKV VOD must be normalized before playback');
  assert.deepEqual(netcastCalls,[normalized],engine+': NetCast receives the generated HLS through its hardware player');
  assert.deepEqual(html5Calls,[],'NetCast must not send Matroska directly to its HTML5 video element');
 }
}
for(const engine of ['auto','mediaplayer']){
 for(const netcastObj of [{play(){}},{}]){
  const seriesUrl='https://teamg.store/boruto1x257.mkv';
  const netcastCalls=[];
  const ctx={state:{screen:'player',playerGeneration:1,auth:{playerEngine:engine,token:'test'},currentPlaylist:{id:'series'},recoveryVod:true,currentSeries:{id:'series_boruto',name:'Boruto'}},
  window:{},API_BASE:'https://ott.teamg.store',netcastObj,v:{},isLegacyNetcast:true,isHls:false,isDirectCdn:false,ua:'Mozilla/5.0 NetCast/4.0',
  c:{url:seriesUrl},streamUrl:seriesUrl,playUrl:seriesUrl,probeSubtitles(){},
  startNetcastPlayer:(v,obj,play)=>netcastCalls.push(play),
  playHtml5:()=>{throw Error('Series episodes on NetCast must use MediaPlayer directly so out-of-band AVCC MKVs like boruto1x257.mkv render video')},
  apiCall:(method,path,body,callback)=>callback(200,{ok:true,sessionId:'b'.repeat(48),url:'/api/ott/vod-hls/'+'b'.repeat(48)+'/index.m3u8'})
  };
  vm.runInNewContext('(function(){'+source+')()',ctx);
  assert.deepEqual(netcastCalls,['https://ott.teamg.store/api/ott/vod-hls/'+'b'.repeat(48)+'/index.m3u8'],engine+': Series episodes on NetCast open the normalized HLS in MediaPlayer');
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
{
 const netcastSource=html.slice(html.indexOf('function startNetcastPlayer('),html.indexOf('var ytMusicPlayer = null;'));
 const html5Source=html.slice(html.indexOf('function playHtml5('),html.indexOf('function stopPlayer('));
 const borutoUrl='https://teamg.store/boruto1x257.mkv';
 // Case 1: NetCast HTML5 does not populate v.videoWidth (stays 0 while playing) -> must NOT interrupt HTML5 playback
 {
  const netcastOpened=[];
  const v={style:{},currentTime:0,videoWidth:0,videoHeight:0,pause(){},removeAttribute(){},load(){},play(){}};
  const native={style:{},playState:0,stop(){},play(){netcastOpened.push(this.data);}};
  const ctx={
   state:{screen:'player',playerGeneration:1,recoveryVod:true,auth:{}},
   window:{location:{protocol:'https:'}},
   navigator:{userAgent:'Mozilla/5.0 (DirectFB; Linux; Ko-KR) AppleWebKit/534.26 (KHTML, like Gecko) NetCast.TV-2013'},
   Date:class{getTime(){return 1000;}},setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},
   hideTuning(){},showToast(){},setBuffering(){},updateProgressDisplay(){},updateDurationDisplay(){},isMusicPlaying(){return false;},recoverPlayback(){},
   $(){return{style:{}};},console
  };
  vm.runInNewContext(netcastSource+'\n'+html5Source,ctx);
  ctx.playHtml5(v,native,borutoUrl,borutoUrl,{url:borutoUrl});
  v.currentTime=1.0;
  v.ontimeupdate();
  assert.deepEqual(netcastOpened,[],'Playing HTML5 VOD must never be interrupted when videoWidth is 0 on NetCast');
 }
 // Case 2: boruto1x257.mkv triggers v.onerror in HTML5 -> retries HTTP first, then releases <video> and switches to NetCast MediaPlayer over HTTP
 {
  const netcastOpened=[];
  let loadCount=0;
  const v={style:{},currentTime:0,videoWidth:0,videoHeight:0,pause(){},removeAttribute(){},load(){loadCount++;},play(){}};
  const native={style:{},playState:0,stop(){},play(){netcastOpened.push(this.data);}};
  const timers=[];
  const ctx={
   state:{screen:'player',playerGeneration:1,recoveryVod:true,auth:{}},
   window:{location:{protocol:'https:'}},
   navigator:{userAgent:'Mozilla/5.0 (DirectFB; Linux; Ko-KR) AppleWebKit/534.26 (KHTML, like Gecko) NetCast.TV-2013'},
   Date:class{getTime(){return 1000;}},setInterval(){return 1;},clearInterval(){},setTimeout(fn){timers.push(fn);return 1;},
   hideTuning(){},showToast(){},setBuffering(){},updateProgressDisplay(){},updateDurationDisplay(){},isMusicPlaying(){return false;},recoverPlayback(){},
   $(){return{style:{}};},console
  };
  vm.runInNewContext(netcastSource+'\n'+html5Source,ctx);
  ctx.playHtml5(v,native,borutoUrl,borutoUrl,{url:borutoUrl});
  v.onerror(); // 1st error retries http:// in HTML5
  assert.equal(v.src,'http://teamg.store/boruto1x257.mkv');
  v.onerror(); // 2nd error releases <video> and schedules NetCast MediaPlayer after 300ms
  timers[timers.length-1]();
  assert.deepEqual(netcastOpened,['http://teamg.store/boruto1x257.mkv'],'HTML5 onerror on NetCast VOD switches to MediaPlayer HTTP after releasing <video>');
 }
 // Case 3: volvealos1726.mkv decodes video frames in HTML5 (videoWidth=1920, videoHeight=1080) -> stays in HTML5 without touching MediaPlayer
 {
  const netcastOpened=[];
  const v={style:{},currentTime:0,videoWidth:1920,videoHeight:1080,pause(){},removeAttribute(){},load(){},play(){}};
  const native={style:{},playState:0,stop(){},play(){netcastOpened.push(this.data);}};
  const ctx={
   state:{screen:'player',playerGeneration:1,recoveryVod:true,auth:{}},
   window:{location:{protocol:'https:'}},
   navigator:{userAgent:'Mozilla/5.0 (DirectFB; Linux; Ko-KR) AppleWebKit/534.26 (KHTML, like Gecko) NetCast.TV-2013'},
   Date:class{getTime(){return 1000;}},setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},
   hideTuning(){},showToast(){},setBuffering(){},updateProgressDisplay(){},updateDurationDisplay(){},isMusicPlaying(){return false;},recoverPlayback(){},
   $(){return{style:{}};},console
  };
  vm.runInNewContext(netcastSource+'\n'+html5Source,ctx);
  const volveUrl='https://teamg.store/volvealos1726.mkv';
  ctx.playHtml5(v,native,volveUrl,volveUrl,{url:volveUrl});
  v.currentTime=2.5;
  v.ontimeupdate();
  assert.deepEqual(netcastOpened,[],'HTML5 with valid video dimensions (1920x1080) stays in HTML5');
 }
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
