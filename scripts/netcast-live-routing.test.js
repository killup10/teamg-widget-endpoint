const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('function startNetcastPlayer('), html.indexOf('function playHtml5('));
function setup(options = {}) {
  let now = 0, nextId = 0;
  const calls = [], timers = new Map(), labels = {};
  const native = {style:{},playState:0,stop(){},play(){
    calls.push(this.data);
    assert.equal(typeof this.onPlayStateChange, 'function', 'Listen before starting playback');
    if (options.failDirect && this.data === direct) { this.playState = 6; this.onPlayStateChange(); }
  }};
  const ctx = {
    state:{screen:'player',playerGeneration:1,recoveryVod:!!options.vod},
    Date:class {getTime(){return now;}},
    setInterval(fn){const id=++nextId;timers.set(id,fn);return id;},
    clearInterval(id){timers.delete(id);},
    hideTuning(){},showToast(){},
    $:id=>labels[id]||(labels[id]={}),
    playHtml5(){calls.push('html5');}
  };
  vm.runInNewContext(source,ctx);
  return {ctx,native,calls,timers,start(url=direct){ctx.startNetcastPlayer(null,native,proxy,url,{});},advance(ms){now+=ms;for(const fn of Array.from(timers.values()))fn();}};
}
const direct='http://186.148.196.67:8900/play/a0cj';
const proxy='https://ott.teamg.store/api/ott/stream.ts?url='+encodeURIComponent(direct);
const normal=setup();normal.start();assert.deepEqual(normal.calls,[direct]);
normal.native.playState=4;normal.advance(15001);assert.deepEqual(normal.calls,[direct,proxy],'Buffering must not suppress the startup timeout');
normal.advance(15001);assert.deepEqual(normal.calls,[direct,proxy,'html5']);
const immediate=setup({failDirect:true});immediate.start();assert.deepEqual(immediate.calls,[direct,proxy],'Handle synchronous native errors');
const converted=setup();
converted.ctx.startNetcastPlayer(null,converted.native,'https://app.test/api/ott/android-audio/session/index.m3u8',direct,{});
assert.deepEqual(converted.calls,['https://app.test/api/ott/android-audio/session/index.m3u8'],'Keep prepared HLS instead of reopening original TS');
assert.equal(immediate.timers.size,1,'Keep only the retry watchdog');
const stale=setup();stale.start();stale.ctx.state.playerGeneration++;stale.advance(16000);assert.deepEqual(stale.calls,[direct]);
for(const options of [{vod:true},{}]) {
  const test=setup(options);test.start(options.vod?direct:'http://cdn.test/live.m3u8');
  assert.deepEqual(test.calls,[proxy],'VOD and HLS must keep their resolved URL');
}
console.log('NetCast direct HTTP, proxy retry, synchronous errors, stalled startup and cancellation pass.');
