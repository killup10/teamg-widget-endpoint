const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const fs = require('node:fs');
const vm = require('node:vm');
const store = require('../ott-store');
const { handle } = require('../ott-api');
process.env.ADMIN_KEY = 'local-regression-admin';
delete process.env.MONGODB_URI;

async function call(path, method = 'GET', body = {}, query = {}, admin = false, headers = {}) {
  let status, data;
  await handle({ method, headers: { ...headers, ...(admin ? { 'x-admin-key': process.env.ADMIN_KEY } : {}) } }, {
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
  await cols.playlists.insertOne({ _id: playlistId, name: 'Live', channels: [{ name: 'Heavy content must not enter startup metadata' }], customM3u: '#EXTM3U\n#EXTINF:-1,Test\nhttps://example.com/live.ts\n' });
  const readPlaylists = cols.playlists.find;
  let startupReads = 0;
  cols.playlists.find = async function(query, projection) {
    const rows = await readPlaylists.call(this, query, projection);
    if (projection && projection.name === 1) {
      startupReads++;
      assert.equal(projection.name, 1, 'Startup must request only explicit metadata fields');
      assert.ok(rows.every(row => !('customM3u' in row) && !('channels' in row)), 'Startup must not read playlist content');
    }
    return rows;
  };
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
  // Reopening the app reuses its saved token/device and needs no registration.
  result = await call('/api/ott/feed', 'GET', {}, { token, deviceId: String(deviceId) });
  assert.equal(result.status, 200);
  assert.equal(result.data.playlists[0].id, String(playlistId));
  assert.equal(startupReads, 3, 'Device registration and both automatic feed loads must use lightweight metadata');
  cols.playlists.find = readPlaylists;
  result = await call('/api/ott/m3u', 'GET', {}, { token, deviceId: String(deviceId), pid: String(playlistId) });
  assert.equal(result.status, 200);
  assert.match(result.data, /#EXTM3U/);
  const originalFindOne = cols.playlists.findOne;
  let contentReads = 0;
  cols.playlists.findOne = async function(query, projection) {
    if (!projection) return originalFindOne.call(this, query);
    assert.ok(projection && projection._id === 1, 'TV reads must explicitly select fields');
    assert.ok(!projection.artworkBackup && !projection.channels, 'TV must not read artwork backups or channel arrays');
    const found = await originalFindOne.call(this, query, projection);
    if (projection.customM3u) contentReads++;
    return found;
  };
  const m3uQuery = { token, deviceId: String(deviceId), pid: String(playlistId) };
  result = await call('/api/ott/m3u', 'GET', {}, m3uQuery);
  assert.equal(result.status, 200);
  assert.equal(contentReads, 0, 'Reopening app must reuse server content cache');
  const editedText = '#EXTM3U\n#EXTINF:-1,Edited\nhttps://example.com/edited.ts\n';
  await cols.playlists.updateOne({ _id: playlistId }, { $set: { customM3u: editedText, updatedAt: '2026-10-11T03:00:00Z' } });
  result = await call('/api/ott/m3u', 'GET', {}, m3uQuery);
  assert.equal(result.data, editedText, 'Cabinet revision changes must invalidate cache immediately');
  assert.ok(contentReads > 0);
  const readsAfterEdit = contentReads;
  result = await call('/api/ott/m3u', 'GET', {}, { ...m3uQuery, _cb: 'force-refresh' });
  assert.ok(contentReads > readsAfterEdit, 'Manual refresh must bypass cache');
  result = await call('/api/ott/m3u', 'GET', {}, m3uQuery, false, { 'accept-encoding': 'gzip' });
  assert.equal(require('node:zlib').gunzipSync(result.data).toString(), editedText);
  await cols.playlists.updateOne({ _id: playlistId }, { $set: { expiresAt: '2000-01-01' } });
  result = await call('/api/ott/m3u', 'GET', {}, m3uQuery);
  assert.equal(result.status, 410, 'Cache must not bypass playlist expiry');
  await cols.playlists.updateOne({ _id: playlistId }, { $set: { expiresAt: '' } });
  await cols.devices.updateOne({ _id: deviceId }, { $set: { playlists: [] } });
  result = await call('/api/ott/m3u', 'GET', {}, m3uQuery);
  assert.equal(result.status, 403, 'Cache must not bypass assignments');
  await cols.devices.updateOne({ _id: deviceId }, { $set: { playlists: [String(playlistId)] } });
  cols.playlists.findOne = originalFindOne;
  result = await admin('assign', 'POST', { deviceId: 'missing', playlistIds: [] });
  assert.equal(result.status, 404, 'A missing device must not report a successful assignment');
  result = await admin('assign', 'POST', { deviceId: String(deviceId), playlistIds: ['missing'] });
  assert.equal(result.status, 404);
  assert.equal((await cols.devices.findOne({ _id: deviceId })).playlists[0], String(playlistId));
  // Payment reminder date is optional, persists, and never blocks access.
  result = await admin('device', 'PUT', { id: String(deviceId), paymentDueDate: '2000-01-01', note: 'Cliente de prueba' });
  assert.equal(result.status, 200);
  result = await call('/api/ott/admin/overview', 'GET', {}, {}, true);
  assert.equal(result.data.devices.find(d => String(d.id) === String(deviceId)).paymentDueDate, '2000-01-01');
  result = await call('/api/ott/feed', 'GET', {}, { token, deviceId: String(deviceId) });
  assert.equal(result.status, 200, 'Past reminder dates must not block playback');
  for (const value of ['2026-02-30', '2026-13-01', '18/10/2026', null, 123, '0000-01-01']) {
    result = await admin('device', 'PUT', { id: String(deviceId), paymentDueDate: value, note: 'Must not save' });
    assert.equal(result.status, 400);
  }
  result = await admin('device', 'PUT', { id: String(deviceId), name: 'TV Sala' });
  assert.equal(result.status, 200);
  let savedDevice = await cols.devices.findOne({ _id: deviceId });
  assert.equal(savedDevice.paymentDueDate, '2000-01-01', 'Other edits must preserve the date');
  assert.equal(savedDevice.note, 'Cliente de prueba', 'Invalid dates must not partially save');
  result = await admin('device', 'PUT', { id: String(deviceId), paymentDueDate: '2028-02-29' });
  assert.equal(result.status, 200, 'Leap days are valid');
  result = await admin('device', 'PUT', { id: String(deviceId), paymentDueDate: '' });
  assert.equal(result.status, 200);
  savedDevice = await cols.devices.findOne({ _id: deviceId });
  assert.equal(savedDevice.paymentDueDate, '', 'The reminder date can be cleared');
  await admin('user', 'POST', { id: String(userId), active: false });
  result = await call('/api/ott/device', 'POST', { token, deviceId: String(deviceId) });
  assert.equal(result.status, 403, 'Deactivated accounts cannot register with an older token');
  result = await call('/api/ott/feed', 'GET', {}, { token, deviceId: String(deviceId) });
  assert.equal(result.status, 401, 'Deactivation must reject the playback heartbeat');
  assert.equal(result.data.error, 'blocked');
  await admin('user', 'POST', { id: String(userId), active: true });
  // Delete through the same query parameter used by Cabinet.
  result = await call('/api/ott/admin/device', 'DELETE', {}, { id: String(deviceId) }, true);
  assert.equal(result.status, 200);
  result = await call('/api/ott/feed', 'GET', {}, { token, deviceId: String(deviceId) });
  assert.equal(result.status, 401, 'Deleting a device must reject the playback heartbeat');
  assert.equal(result.data.error, 'no-device');
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
