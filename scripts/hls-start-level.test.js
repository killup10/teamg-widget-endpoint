const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('ott/index.html','utf8');
const start=html.indexOf('var stableLgHls =');
const end=html.indexOf('state.hlsInstance.on(Hls.Events.FRAG_BUFFERED',start);
for(const ua of ['NetCast','Web0S','webOS','NetCast Web0S','SMART-TV Tizen','Mozilla Firefox']){
  const callbacks={},calls=[];let config;
  function Hls(options){config=options;this.levels=[{height:360,width:640,bitrate:800000},{height:1080,width:1920,bitrate:8000000},{height:720,width:1280,bitrate:2000000},{height:2160,width:3840,bitrate:20000000}];this.loadSource=()=>{};this.attachMedia=()=>{};this.on=(e,cb)=>callbacks[e]=cb;this.startLoad=()=>calls.push('load');Object.defineProperty(this,'currentLevel',{set(v){calls.push(v);}});}
  Hls.Events={LEVEL_LOADED:'level',MANIFEST_PARSED:'manifest'};
  const ctx={state:{},isLegacyNetcast:ua==='NetCast',navigator:{userAgent:ua},androidHls:false,androidPlayError:()=>{},Hls,playUrl:'http://cdn.test/master.m3u8',v:{play(){calls.push('play');}}};
  vm.runInNewContext(html.slice(start,end),ctx);
  callbacks.manifest();
  if(ua!=='NetCast'){assert.equal(config.autoStartLoad,true);assert.deepEqual(calls,['play']);}
  else {assert.equal(config.autoStartLoad,false);assert.deepEqual(calls,[1,'load','play']);}
}
console.log('Only NetCast fixes HLS at 1080p; webOS, Tizen and desktop keep adaptive 4K levels.');
