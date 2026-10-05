const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  let ready, error, listener, current = 10000, status = 'NONE';
  const timers = new Map(), calls = [];
  const api = {
    stop() { status='IDLE'; }, close() { status='NONE'; }, open(url) { calls.push(['open',url]); status='IDLE'; },
    setListener(value) { listener=value; }, setDisplayRect(...v) { calls.push(['rect',...v]); },
    setDisplayMethod() {}, setSilentSubtitle(value) { calls.push(['silent',value]); },
    prepareAsync(ok, bad) { ready=ok; error=bad; },
    play() { status='PLAYING'; }, pause() { status='PAUSED'; },
    getState() { return status; }, getDuration() { return 60000; }, getCurrentTime() { return current; },
    seekTo(ms) { current=ms; }, getTotalTrackInfo() { return [{type:'TEXT',index:7},{type:'AUDIO',index:2}]; },
    setSelectTrack(type,index) { calls.push(['select',type,index]); }
  };
  const root = {webapis:{avplay:api},setTimeout(fn) {timers.set(1,fn);return 1;},clearTimeout(id) {timers.delete(id);}};
  vm.runInNewContext(fs.readFileSync('ott/native-player.js','utf8'),{window:root});
  return {player:root.TeamGNative,root,api,calls,timers,ready:()=>ready(),error:()=>error(),listener:()=>listener};
}
const t = setup();
let ready=0, failed=0, errors=0;
t.player.start('https://example/video.mkv',{ready:()=>ready++,failed:()=>failed++,error:()=>errors++});
assert.equal(t.player.active(),true);
t.ready(); assert.equal(ready,1); assert.equal(t.timers.size,0);
assert.deepEqual(t.calls.find(c=>c[0]==='rect'),['rect',0,0,1920,1080]);
assert.equal(t.player.info().currentTime,10);
assert.equal(t.player.toggle(),true); assert.equal(t.player.info().paused,true);
t.player.toggle(); assert.equal(t.player.info().paused,false);
assert.equal(t.player.seek(22),true); assert.equal(t.player.info().currentTime,22);
assert.equal(t.player.tracks('TEXT')[0].index,7);
assert.equal(t.player.select('TEXT',7),true);
t.listener().onerror(); t.listener().onerror(); assert.equal(errors,1); assert.equal(failed,0);
t.player.stop(); assert.equal(t.player.active(),false);
const cancelled = setup();
cancelled.player.start('https://example/old',{failed:()=>failed++,ready:()=>ready++});
cancelled.player.stop(); cancelled.ready(); assert.equal(ready,1);
const unavailable = setup(); unavailable.root.webapis=null;
unavailable.player.start('https://example/v',{failed:()=>failed++}); assert.equal(failed,1);
const timed = setup(); timed.player.start('https://example/v',{failed:()=>failed++});
timed.timers.get(1)(); timed.ready(); assert.equal(failed,2); assert.equal(timed.player.active(),false);
console.log('AVPlay lifecycle, controls, cancellation, timeout fallback and explicit errors pass.');
