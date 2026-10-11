const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../ott-store');
const { handle } = require('../ott-api');

(async () => {
  const cols = await store.init();

  // Create users
  const u1 = { _id: 'user_alpha', login: 'cliente1', pass: store.hashPass('123456', 'salt1'), salt: 'salt1', role: 'fake', active: true };
  const u2 = { _id: 'user_beta', login: 'cliente2', pass: store.hashPass('123456', 'salt2'), salt: 'salt2', role: 'fake', active: true };
  await cols.users.insertOne(u1);
  await cols.users.insertOne(u2);

  // Create playlists (including one with an ObjectId-like object)
  const p1 = { _id: 'pl_vip', name: 'Canales VIP', url: 'http://cdn/vip.m3u' };
  const p2 = { _id: 'pl_docs', name: 'Documentales', url: 'http://cdn/docs.m3u' };
  const p3 = {
    _id: { toString() { return 'pl_mongo_obj'; } },
    name: 'Películas 4K',
    url: 'http://cdn/4k.m3u',
    customM3u: '#EXTM3U\n#EXTINF:-1,Test\nhttps://example.com/test.ts\n'
  };
  await cols.playlists.insertOne(p1);
  await cols.playlists.insertOne(p2);
  await cols.playlists.insertOne(p3);

  // 1. Client 1 logs in
  let status, resData;
  await handle({ method: 'POST', headers: {} }, { writeHead(s) { status = s; }, end(raw) { resData = JSON.parse(raw); } }, '/api/ott/login', {}, { login: 'cliente1', password: '123456' });
  assert.equal(status, 200);
  assert.equal(resData.ok, true);
  const token1 = resData.token;

  // 2. Client 1 registers TV
  await handle({ method: 'POST', headers: {} }, { writeHead(s) { status = s; }, end(raw) { resData = JSON.parse(raw); } }, '/api/ott/device', {}, { token: token1, deviceId: 'tv_living_room', name: 'LG OLED' });
  assert.equal(status, 200);
  assert.equal(resData.ok, true);
  assert.equal(resData.playlists.length, 0); // Not assigned yet

  // 3. Admin assigns playlists (p1, p2, and p3 with ObjectId) to TV
  await cols.devices.updateOne({ _id: 'tv_living_room' }, { $set: { playlists: ['pl_vip', 'pl_docs', 'pl_mongo_obj'] } });

  // 4. Client 1 refreshes feed via red button (/api/ott/feed)
  await handle({ method: 'GET', headers: {} }, { writeHead(s) { status = s; }, end(raw) { resData = JSON.parse(raw); } }, '/api/ott/feed', { token: token1, deviceId: 'tv_living_room' }, {});
  assert.equal(status, 200);
  assert.equal(resData.ok, true);
  assert.equal(resData.playlists.length, 3, 'Client must receive all 3 assigned playlists including string and ObjectId IDs');
  assert.equal(resData.playlists[0].id, 'pl_vip');
  assert.equal(resData.playlists[1].id, 'pl_docs');
  assert.equal(resData.playlists[2].id, 'pl_mongo_obj');

  // 5. Client accesses M3U for assigned playlist
  let m3uStatus, m3uHeaders, m3uBody;
  await handle({ method: 'GET', headers: {} }, { writeHead(s, h) { m3uStatus = s; m3uHeaders = h; }, end(raw) { m3uBody = raw; } }, '/api/ott/m3u', { token: token1, deviceId: 'tv_living_room', pid: 'pl_mongo_obj' }, {});
  assert.equal(m3uStatus, 200);
  assert.ok(m3uBody.includes('#EXTM3U'));

  // 6. Another client cannot take over the TV or its assigned playlists.
  let login2Res;
  await handle({ method: 'POST', headers: {} }, { writeHead(s) { status = s; }, end(raw) { login2Res = JSON.parse(raw); } }, '/api/ott/login', {}, { login: 'cliente2', password: '123456' });
  await handle({ method: 'POST', headers: {} }, { writeHead(s) { status = s; }, end(raw) { resData = JSON.parse(raw); } }, '/api/ott/device', {}, { token: login2Res.token, deviceId: 'tv_living_room', name: 'LG OLED Renamed' });
  assert.equal(status, 403);
  assert.equal((await cols.devices.findOne({ _id: 'tv_living_room' })).userId, u1._id);
  await handle({ method: 'GET', headers: {} }, { writeHead(s) { status = s; }, end(raw) { resData = JSON.parse(raw); } }, '/api/ott/feed', { token: login2Res.token, deviceId: 'tv_living_room' }, {});
  assert.equal(status, 401);
  assert.equal((await cols.devices.findOne({ _id: 'tv_living_room' })).userId, u1._id);

  // 7. Playlists stay in bottom tabs without duplicate Home folder cards.
  const html = fs.readFileSync(path.join(__dirname, '..', 'ott', 'index.html'), 'utf8');
  assert.ok(!html.includes('home-pl-card'), 'Home must not duplicate playlists as folder cards');
  assert.ok(html.includes('Último contenido abierto'), 'Home must retain recent content');
  assert.ok(html.includes("homeTabs.push({ id: '__fav', name: 'Favoritos' });"), 'getHomeTabsList must place Favoritos after assigned playlists');

  console.log('Client playlists assignment and visibility unit tests pass successfully.');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
