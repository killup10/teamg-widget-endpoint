const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const store = require('../ott-store');
const { handle } = require('../ott-api');
process.env.ADMIN_KEY = 'local-regression-admin';
delete process.env.MONGODB_URI;

async function call(path, method = 'GET', body = {}, query = {}, admin = false) {
  let status, data;
  await handle({ method, headers: admin ? { 'x-admin-key': process.env.ADMIN_KEY } : {} }, {
    writeHead(code) { status = code; },
    end(raw) { try { data = JSON.parse(raw); } catch { data = raw; } }
  }, path, query, body);
  return { status, data };
}

(async () => {
  const cols = await store.init();
  const userId = new ObjectId(), deviceId = new ObjectId(), playlistId = new ObjectId();
  await cols.users.insertOne({ _id: userId, login: 'mongo-client', salt: 'test-salt', pass: store.hashPass('original', 'test-salt'), active: false, role: 'fake' });
  await cols.devices.insertOne({ _id: deviceId, userId, playlists: [] });
  await cols.playlists.insertOne({ _id: playlistId, name: 'Live', customM3u: '#EXTM3U\n#EXTINF:-1,Test\nhttps://example.com/live.ts\n' });
  const admin = (path, method, body) => call('/api/ott/admin/' + path, method, body, {}, true);
  let result = await admin('user', 'POST', { id: String(userId), active: true, password: 'updated' });
  assert.equal(result.status, 200);
  result = await call('/api/ott/login', 'POST', { login: 'mongo-client', password: 'original' });
  assert.equal(result.status, 401);
  result = await call('/api/ott/login', 'POST', { login: 'mongo-client', password: 'updated' });
  assert.equal(result.status, 200, 'MongoDB account must log in after Cabinet activation/password update');
  const token = result.data.token;
  result = await admin('assign', 'POST', { deviceId: String(deviceId), playlistIds: [String(playlistId)] });
  assert.equal(result.status, 200);
  result = await call('/api/ott/device', 'POST', { token, deviceId: String(deviceId), name: 'TV' });
  assert.equal(result.status, 200, 'MongoDB user and device IDs must survive token serialization');
  assert.equal(result.data.playlists[0].id, String(playlistId));
  result = await call('/api/ott/feed', 'GET', {}, { token, deviceId: String(deviceId) });
  assert.equal(result.status, 200);
  assert.equal(result.data.playlists.length, 1);
  result = await call('/api/ott/m3u', 'GET', {}, { token, deviceId: String(deviceId), pid: String(playlistId) });
  assert.equal(result.status, 200);
  assert.match(result.data, /#EXTM3U/);
  result = await admin('assign', 'POST', { deviceId: 'missing', playlistIds: [] });
  assert.equal(result.status, 404, 'A missing device must not report a successful assignment');
  result = await admin('assign', 'POST', { deviceId: String(deviceId), playlistIds: ['missing'] });
  assert.equal(result.status, 404);
  assert.equal((await cols.devices.findOne({ _id: deviceId })).playlists[0], String(playlistId));
  await admin('user', 'POST', { id: String(userId), active: false });
  result = await call('/api/ott/device', 'POST', { token, deviceId: String(deviceId) });
  assert.equal(result.status, 403, 'Deactivated accounts cannot register with an older token');
  const find = cols.playlists.find;
  cols.playlists.find = async () => { throw new Error('Database unavailable'); };
  const originalError = console.error;
  console.error = () => {};
  try {
    result = await call('/api/ott/admin/overview', 'GET', {}, {}, true);
    assert.equal(result.status, 500, 'A database error must not appear as an empty Cabinet');
    assert.equal(result.data.ok, false);
  } finally { cols.playlists.find = find; console.error = originalError; }
  console.log('Cabinet activation, password, MongoDB IDs, assignment, feed and M3U regressions passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
