const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('ott/index.html','utf8');
const begin=html.indexOf("  var engine = state.auth.playerEngine || 'auto';",html.indexOf('  var needsProxy = false;'));
const source=html.slice(begin,html.indexOf('\nfunction startSamsungPlayer(',begin)).trim();
for(const engine of ['auto','mediaplayer']){
 const calls=[];const url='http://186.148.196.100:8000/play/a013';
 const ctx={state:{auth:{playerEngine:engine,token:'test'},currentPlaylist:{id:'list'},recoveryVod:false},
 window:{},netcastObj:{play(){}},v:{},isLegacyNetcast:true,isHls:false,isDirectCdn:false,ua:'Mozilla/5.0 NetCast/4.0',
 c:{url},streamUrl:url,playUrl:url,probeSubtitles(){},
 startNetcastPlayer:(v,obj,play)=>calls.push(play),playHtml5:()=>{throw Error('Wrong HTML5 route')},
 apiCall:()=>{throw Error('Native playback blocked by packaging')}
 };
 vm.runInNewContext('(function(){'+source+')()',ctx);
 assert.deepEqual(calls,[url],engine+': full startup path opens original HTTP URL immediately');
}
console.log('NetCast live startup: Auto and MediaPlayer open Astra HTTP directly without preparing HLS.');
