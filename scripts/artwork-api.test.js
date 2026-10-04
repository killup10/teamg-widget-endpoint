const assert = require('node:assert/strict');
process.env.MONGODB_URI = '';
process.env.ADMIN_KEY = 'local-artwork-test';
const store = require('../ott-store');
const {handle} = require('../ott-api');
const {revision} = require('../artwork-fill');
async function call(body) {
  let status, data;
  await handle({method:'POST',headers:{'x-admin-key':process.env.ADMIN_KEY,host:'ott.teamg.store'}}, {
    writeHead(code) { status = code; }, end(raw) { data = JSON.parse(raw); }
  }, '/api/ott/admin/playlist/fill-artwork', {}, body);
  return {status,data};
}
(async () => {
  const cols = await store.init();
  const text = '#EXTM3U\n#EXTINF:-1 tvg-id="keep" group-title="A",Movie (2000)\n#EXTVLCOPT:network-caching=500\nhttps://stream/a\n';
  await cols.playlists.insertOne({_id:'test', customM3u:text});
  const image = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,217]).toString('base64');
  const entry = {name:'Movie (2000)',group:'A',url:'https://stream/a',data:image};
  const body = {id:'test',revision:revision(text),entries:[entry]};
  const result = await call(body);
  assert.equal(result.status,200); assert.equal(result.data.changed,1);
  const pl = await cols.playlists.findOne({_id:'test'});
  assert.equal(pl.artworkBackup,text);
  assert.ok(pl.customM3u.includes('tvg-id="keep"'));
  assert.ok(pl.customM3u.includes('#EXTVLCOPT:network-caching=500'));
  assert.equal((await cols.icons.find({})).length,1);
  assert.equal((await call(body)).status,409);
  body.revision = result.data.revision;
  const retry = await call(body);
  assert.equal(retry.data.changed,0); assert.equal(retry.data.preserved,1);
  assert.equal((await cols.icons.find({})).length,1);
  assert.equal((await call({...body, entries:[{...entry,data:'data:image/jpeg;base64,YmFk'}]})).status,400);
  console.log('API artwork: backup, exact patch, stale revision, deduplication and invalid image checks passed.');
})().catch(e => { console.error(e); process.exitCode=1; });
