const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let xhr;
const timers = new Map();
const root = {
  document:{createElement(){return {set href(v){this.value=new URL(v).href;},get href(){return this.value;}};}},
  XMLHttpRequest:function(){xhr=this;this.open=()=>{};this.send=()=>{};this.abort=()=>{this.aborted=true;};},
  setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}
};
vm.runInNewContext(fs.readFileSync('ott/hls-variant.js','utf8'),{window:root});
const player=root.TeamGHlsVariant;
const url='http://cdn.test/token/bitel/bicolorfree_abr/playlist.m3u8?uid=123';
const master='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8379203,RESOLUTION=1920x1080,CODECS="avc1.4d0028,mp4a.40.2"\nbitel/bicolorfree_source/chunks.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2225203,RESOLUTION=1280x720\nbitel/bicolorfree_720p/chunks.m3u8';
const v=player.choose(master,url);
assert.equal(v.height,1080);
assert.equal(v.url,'http://cdn.test/token/bitel/bicolorfree_abr/bitel/bicolorfree_source/chunks.m3u8');
assert.equal(player.choose('#EXTM3U\n#EXTINF:6\nsegment.ts',url),null);
assert.equal(player.choose('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,AUDIO="audio"\nvideo.m3u8',url),null);
assert.equal(player.choose('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160\n4k.m3u8\n'+master,url).height,1080);
assert.equal(player.choose('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="hvc1.1.6"\nhevc.m3u8',url),null);
assert.equal(player.choose(master.replace('bitel/bicolorfree_source/chunks.m3u8','../source/chunks.m3u8?signature=abc'),url).url,'http://cdn.test/token/bitel/source/chunks.m3u8?signature=abc');
let delivered=[];
const cancel=player.resolve(url,x=>delivered.push(x));
cancel(); xhr.readyState=4; xhr.status=200; xhr.responseText=master; xhr.onreadystatechange();
assert.equal(delivered.length,0);assert.ok(xhr.aborted);assert.equal(timers.size,0);
player.resolve(url,x=>delivered.push(x));
xhr.readyState=4; xhr.status=200; xhr.responseText=master; xhr.onreadystatechange();
assert.equal(delivered[0].height,1080);assert.equal(timers.size,0);
player.resolve(url,x=>delivered.push(x));timers.get(1)();xhr.onreadystatechange();
assert.equal(delivered.length,2);assert.equal(delivered[1],null);assert.ok(xhr.aborted);
console.log('Legacy HLS rendition selection, signed paths, audio safety, timeout and cancellation pass.');
let failed;
player.resolve(url,(v,e)=>{assert.equal(v,null);failed=e;},'https://app.test/api/ott/stream.m3u8');
xhr.readyState=4;xhr.status=403;xhr.responseText='Forbidden';xhr.onreadystatechange();
assert.equal(failed,true);
player.resolve(url,(v,e)=>{assert.equal(e,false);assert.equal(v.url,'http://cdn.test/token/bitel/bicolorfree_abr/bitel/bicolorfree_source/chunks.m3u8');},'https://app.test/api/ott/stream.m3u8');
xhr.readyState=4;xhr.status=200;xhr.responseURL='https://app.test/api/ott/stream.m3u8';xhr.responseText=master;xhr.onreadystatechange();
