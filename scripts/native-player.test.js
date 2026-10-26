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

function loaderSetup() {
  const queue = new Map(), scripts = []; let nextId = 0;
  const root = {
    navigator: {userAgent:'Mozilla/5.0 SMART-TV Tizen/5.0'},
    setTimeout(fn) { const id = ++nextId; queue.set(id, fn); return id; },
    clearTimeout(id) { queue.delete(id); },
    document: {createElement() { return {}; }, head: {
      appendChild(script) { scripts.push(script); script.parentNode = this; },
      removeChild(script) { script.parentNode = null; }
    }}
  };
  vm.runInNewContext(fs.readFileSync('ott/native-player.js','utf8'),{window:root});
  function tick() { const [id, fn] = queue.entries().next().value; queue.delete(id); fn(); }
  return {root, scripts, queue, tick, player:root.TeamGNative};
}
const delayed = loaderSetup(); let notifications = 0;
delayed.player.load(() => notifications++);
delayed.player.load(() => notifications++);
assert.equal(delayed.scripts.length, 1, 'concurrent requests share a load');
assert.equal(delayed.player.status(), 'loading');
delayed.scripts[0].onerror();
delayed.root.webapis = {avplay:setup().api};
delayed.tick();
assert.equal(delayed.player.available(), true, 'detect host API exposed after script failure');
assert.equal(notifications, 2);
assert.equal(delayed.queue.size, 0);
const missing = loaderSetup(); let completed = 0;
missing.player.load(() => completed++);
missing.scripts[0].onload(); // A successful request alone does not mean AVPlay exists.
while (missing.queue.size) missing.tick();
assert.equal(missing.player.status(), 'unavailable');
assert.equal(completed, 1);
missing.player.load(() => completed++);
assert.equal(missing.scripts.length, 2, 'retry after unavailable');
missing.root.webapis = {avplay:setup().api};
missing.scripts[1].onload();
assert.equal(missing.player.status(), 'available');
assert.equal(completed, 2);
assert.equal(missing.queue.size, 0);
const browser = loaderSetup(); browser.root.navigator.userAgent = 'Chrome';
browser.player.load(() => {});
assert.equal(browser.player.status(), 'unsupported');
assert.equal(browser.scripts.length, 0);
console.log('AVPlay delayed detection, bounded timeout, shared load, retry and browser isolation pass.');
