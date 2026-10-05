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
  const text = '#EXTM3U\n#EXTINF:-1 group-title="Test Series",T1 E1\nhttps://stream/1\n#EXTINF:-1 tvg-logo="https://existing/logo" group-title="Test Series",T1 E2\nhttps://stream/2\n';
  await cols.playlists.insertOne({_id:'test_series', customM3u:text});
  
  const horizImage = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,217]).toString('base64');
  const vertImage = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,218,255,217]).toString('base64');
  
  const entries = [
    { name: 'T1 E1', group: 'Test Series', url: 'https://stream/1', data: horizImage, posterData: vertImage, isSeries: true },
    { name: 'T1 E2', group: 'Test Series', url: 'https://stream/2', data: horizImage, posterData: vertImage, isSeries: true }
  ];
  
  const body = { id: 'test_series', revision: revision(text), entries };
  const res = await call(body);
  assert.equal(res.status, 200);
  assert.equal(res.data.changed, 1);
  assert.equal(res.data.preserved, 1);
  
  const pl = await cols.playlists.findOne({_id:'test_series'});
  assert.ok(pl.customM3u.includes('tvg-logo="https://ott.teamg.store/api/ott/icon/artwork_'));
  assert.ok(pl.customM3u.includes('series-logo="https://ott.teamg.store/api/ott/icon/artwork_'));
  assert.ok(pl.customM3u.includes('series-poster="https://ott.teamg.store/api/ott/icon/artwork_'));
  assert.ok(pl.customM3u.includes('tvg-logo="https://existing/logo"'));
  console.log('Series artwork test passed successfully.');
})().catch(e => { console.error(e); process.exitCode=1; });
