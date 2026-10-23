const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function setup(ua = 'NetCast') {
  let id = 0;
  const timers = new Map(), loaded = [], fitted = [];
  const window = {navigator:{userAgent:ua},setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(fs.readFileSync('ott/catalog-images.js','utf8'), {window});
  const images = Array.from({length:18}, (_,i) => ({style:{},getAttribute(){return 'cover-'+i;},removeAttribute(){this.removed=true;},set src(v){loaded.push(v);}}));
  return {api:window.TeamGCatalogImages,images,loaded,fitted,start(){window.TeamGCatalogImages.start({querySelectorAll(){return images;}},img=>fitted.push(img));},tick(ms){for(const [key,t] of [...timers])if(t.ms===ms){timers.delete(key);t.fn();}}};
}
const t=setup();t.start();assert.equal(t.loaded.length,0,'Let remote focus render before artwork');
t.tick(40);assert.equal(t.loaded.length,2,'Limit simultaneous image loads to two');
t.images[0].onload();t.tick(40);assert.equal(t.loaded.length,3);assert.equal(t.fitted.length,1);
t.tick(6000);t.tick(40);assert.equal(t.loaded.length,5,'Timed-out artwork must not block the queue');
t.api.stop();t.tick(40);t.tick(6000);assert.equal(t.loaded.length,5,'Stop old page requests and pending work');
const again=setup();again.start();again.tick(40);const old=again.images[0].onload;again.start();old();again.tick(40);assert.equal(again.loaded.length,4,'Stale callbacks cannot advance a replacement queue');
const original='https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.webp';
assert.equal(t.api.thumbnail('http://ott.teamg.store/api/ott/img?url='+encodeURIComponent(original)),'https://is1-ssl.mzstatic.com/image/thumb/a/200x200bb.jpg');
assert.equal(t.api.thumbnail('https://other.test/poster.jpg'),'https://other.test/poster.jpg');
assert.equal(t.api.legacy(),true);
for(const ua of ['NetCast Web0S','webOS','Tizen','Chrome'])assert.equal(setup(ua).api.legacy(),false);
console.log('Artwork concurrency, timeouts, cancellation, smaller JPEGs and modern TV isolation pass.');
