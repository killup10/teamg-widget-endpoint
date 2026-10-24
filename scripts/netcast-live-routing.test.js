const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('function startNetcastPlayer('), html.indexOf('function playHtml5('));
function setup(options = {}) {
  let now = 0, nextId = 0;
  const calls = [], timers = new Map(), delayed = new Map(), labels = {};
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
    setTimeout(fn,ms){const id=++nextId;delayed.set(id,{fn,at:now+ms});return id;},
    clearTimeout(id){delayed.delete(id);},
    hideTuning(){},showToast(){},
    $:id=>labels[id]||(labels[id]={}),
    playHtml5(){calls.push('html5');}
  };
  vm.runInNewContext(source,ctx);
  return {ctx,native,calls,timers,start(url=direct){ctx.startNetcastPlayer(null,native,proxy,url,{});},advance(ms){now+=ms;for(const fn of Array.from(timers.values()))fn();for(const [id,job] of Array.from(delayed.entries()))if(job.at<=now){delayed.delete(id);job.fn();}}};
}
const direct='http://186.148.196.67:8900/play/a0cj';
const proxy='https://ott.teamg.store/api/ott/stream.ts?url='+encodeURIComponent(direct);
const proxyHttp='http://ott.teamg.store/api/ott/stream.ts?url='+encodeURIComponent(direct);
const normal=setup();normal.start();assert.deepEqual(normal.calls,[direct]);
normal.native.playState=4;normal.advance(15001);
assert.deepEqual(normal.calls,[direct],'Wait for the native decoder to release before retrying');
assert.equal(normal.native.data,direct,'Never wipe native data with empty string which crashes NetCast WebKit');
normal.advance(300);assert.deepEqual(normal.calls,[direct,proxyHttp],'Buffering must not suppress the startup timeout');
normal.advance(15001);normal.advance(300);assert.deepEqual(normal.calls,[direct,proxyHttp,'html5']);
const immediate=setup({failDirect:true});immediate.start();immediate.advance(300);assert.deepEqual(immediate.calls,[direct,proxyHttp],'Handle synchronous native errors');
const converted=setup();
converted.ctx.startNetcastPlayer(null,converted.native,'https://app.test/api/ott/android-audio/session/index.m3u8',direct,{});
assert.deepEqual(converted.calls,['https://app.test/api/ott/android-audio/session/index.m3u8'],'Keep prepared HLS instead of reopening original TS');
assert.equal(immediate.timers.size,1,'Keep only the retry watchdog');
const stale=setup();stale.start();stale.ctx.state.playerGeneration++;stale.advance(16000);assert.deepEqual(stale.calls,[direct]);
const cancelled=setup({failDirect:true});cancelled.start();cancelled.ctx.state.screen='playlists';cancelled.advance(300);assert.deepEqual(cancelled.calls,[direct],'Leaving playback must cancel the delayed fallback');
const movie=setup({vod:true});
const chatran='https://teamg.store/aventurchatr86.mkv';
movie.ctx.startNetcastPlayer(null,movie.native,chatran,chatran,{});
assert.deepEqual(movie.calls,['http://teamg.store/aventurchatr86.mkv'],'Use the verified HTTP movie host on native NetCast');
movie.native.playState=6;movie.native.onPlayStateChange();movie.advance(300);
assert.deepEqual(movie.calls,['http://teamg.store/aventurchatr86.mkv','http://teamg.store/aventurchatr86.mkv'],'Keep HTTP transport on retry for teamg.store to avoid TLS Alert 70');
movie.native.playState=6;movie.native.onPlayStateChange();movie.advance(300);
assert.deepEqual(movie.calls,['http://teamg.store/aventurchatr86.mkv','http://teamg.store/aventurchatr86.mkv'],'Never fall back to HTML5 for MKV movies on NetCast');

const playingMovie=setup({vod:true});
playingMovie.ctx.startNetcastPlayer(null,playingMovie.native,chatran,chatran,{});
playingMovie.native.playState=1;playingMovie.native.onPlayStateChange();
assert.equal(playingMovie.timers.size,0,'Playing movies must immediately disarm the startup watchdog');
playingMovie.advance(20000);
assert.deepEqual(playingMovie.calls,['http://teamg.store/aventurchatr86.mkv'],'Healthy movies must never be interrupted by the watchdog');

const external=setup({vod:true});external.ctx.startNetcastPlayer(null,external.native,'https://external.test/movie.mkv','https://external.test/movie.mkv',{});
assert.deepEqual(external.calls,['https://external.test/movie.mkv'],'Never downgrade unverified external hosts');
const hlsTest=setup();hlsTest.start('http://cdn.test/live.m3u8');
assert.deepEqual(hlsTest.calls,[proxyHttp],'HLS must keep resolved proxy URL downgraded to HTTP');
const vodDirectTest=setup({vod:true});vodDirectTest.start(direct);
assert.deepEqual(vodDirectTest.calls,[direct],'VOD HTTP streams must play direct on NetCast native player');
console.log('NetCast direct HTTP, proxy retry, synchronous errors, stalled startup and cancellation pass.');
