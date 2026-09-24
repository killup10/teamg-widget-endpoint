// API del sistema OTT: login de clientes, registro de dispositivos,
// entrega de playlists asignadas y panel admin. Sin dependencias externas.
const crypto = require('crypto');
const store = require('./ott-store');

const secret = () => process.env.TOKEN_SECRET || process.env.ADMIN_KEY || 'dev-secret';
const ADMIN = () => process.env.ADMIN_KEY || '';

function sign(uid) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 90; // 90 días
  const body = Buffer.from(JSON.stringify({ u: uid, e: exp })).toString('base64');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('hex');
  return 'v1.' + body + '.' + sig;
}
function verify(token) {
  try {
    const p = String(token || '').split('.');
    if (p.length !== 3 || p[0] !== 'v1') return null;
    const sig = crypto.createHmac('sha256', secret()).update(p[1]).digest('hex');
    if (sig !== p[2]) return null;
    const d = JSON.parse(Buffer.from(p[1], 'base64').toString());
    if (!d.u || d.e < Date.now()) return null;
    return d.u;
  } catch (e) { return null; }
}

// Admin real con usuario+password (vive en la misma colección users con role).
// Se crea solo desde variables de entorno ADMIN_LOGIN/ADMIN_PASS (nunca en el repo).
async function ensureAdmin(cols) {
  const login = (process.env.ADMIN_LOGIN || '').trim();
  const pass = process.env.ADMIN_PASS || '';
  if (!login || !pass) return;
  const prev = await cols.users.findOne({ login });
  if (prev) { if (prev.role !== 'admin') await cols.users.updateOne({ _id: prev._id }, { $set: { role: 'admin' } }); return; }
  const salt = crypto.randomBytes(8).toString('hex');
  await cols.users.insertOne({ _id: store.uid(), login, salt, pass: store.hashPass(pass, salt), role: 'admin', active: true, created: store.nowIso() });
  console.log('[OTT] admin creado: ' + login);
}
function admSign(uid) {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12h
  const body = Buffer.from(JSON.stringify({ u: uid, e: exp, a: 1 })).toString('base64');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('hex');
  return 'adm.' + body + '.' + sig;
}
async function adminAuthed(cols, req) {
  const h = req.headers['x-admin-key'] || '';
  if (ADMIN() && h === ADMIN()) return true; // compatibilidad: ADMIN_KEY
  try {
    const p = String(h).split('.');
    if (p.length !== 3 || p[0] !== 'adm') return false;
    const sig = crypto.createHmac('sha256', secret()).update(p[1]).digest('hex');
    if (sig !== p[2]) return false;
    const d = JSON.parse(Buffer.from(p[1], 'base64').toString());
    if (!d.u || !d.a || d.e < Date.now()) return false;
    const u = await cols.users.findOne({ _id: d.u });
    return !!(u && u.role === 'admin' && u.active !== false);
  } catch (e) { return false; }
}
function expired(u) {
  if (u.active === false) return 'desactivada';
  if (u.expires) { const t = Date.parse(u.expires); if (!isNaN(t) && t < Date.now()) return 'vencida'; }
  return null;
}

async function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'OTT-TV/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}
const pub = (p) => ({ id: p._id, name: p.name, epg: p.epgUrl || '' });

async function authedDevice(body, query) {
  const cols = await store.init();
  const uid = verify(body.token || query.token);
  if (!uid) return { err: 'no-auth' };
  const user = await cols.users.findOne({ _id: uid });
  if (!user) return { err: 'no-user' };
  if (expired(user)) return { err: 'blocked' };
  const devId = body.deviceId || query.deviceId;
  if (!devId) return { err: 'no-device' };
  const dev = await cols.devices.findOne({ _id: devId, userId: uid });
  if (!dev) return { err: 'no-device' };
  return { cols, user, dev };
}

async function handle(req, res, pathname, query, body) {
  const cols = await store.init();

  // ---- TV: login con usuario/password que crea el admin ----
  if (pathname === '/api/ott/login' && req.method === 'POST') {
    const u = await cols.users.findOne({ login: String(body.login || '').trim() });
    if (!u) return json(res, 401, { ok: false, error: 'Credenciales inválidas' });
    const h = store.hashPass(body.password || '', u.salt);
    if (h !== u.pass) return json(res, 401, { ok: false, error: 'Credenciales inválidas' });
    const block = expired(u);
    if (block) return json(res, 403, { ok: false, error: 'Cuenta ' + block + '. Contacta a tu proveedor.' });
    return json(res, 200, { ok: true, token: sign(u._id), name: u.login });
  }

  // ---- TV: NEW DEVICE (registra o actualiza nombre del TV) ----
  if (pathname === '/api/ott/device' && req.method === 'POST') {
    const uid = verify(body.token);
    if (!uid) return json(res, 401, { ok: false, error: 'no-auth' });
    const user = await cols.users.findOne({ _id: uid });
    if (!user) return json(res, 401, { ok: false, error: 'no-user' });
    const devId = String(body.deviceId || '').trim();
    if (!devId) return json(res, 400, { ok: false, error: 'Falta deviceId' });
    const name = String(body.name || body.platform || 'SmartTV').trim().slice(0, 60) || 'SmartTV';
    const platform = String(body.platform || '').slice(0, 60);
    const prev = await cols.devices.findOne({ _id: devId });
    if (prev && prev.userId !== uid) return json(res, 403, { ok: false, error: 'Dispositivo de otro usuario' });
    if (prev) await cols.devices.updateOne({ _id: devId }, { $set: { name, platform, lastSeen: store.nowIso() } });
    else await cols.devices.insertOne({ _id: devId, userId: uid, name, platform, playlists: [], created: store.nowIso(), lastSeen: store.nowIso() });
    const dev = await cols.devices.findOne({ _id: devId });
    const pls = await cols.playlists.find({});
    const mine = pls.filter((p) => (dev.playlists || []).indexOf(p._id) > -1).map(pub);
    return json(res, 200, { ok: true, device: { id: dev._id, name: dev.name }, playlists: mine });
  }

  // ---- TV: botón rojo = refrescar carpetas asignadas ----
  if (pathname === '/api/ott/feed' && req.method === 'GET') {
    const a = await authedDevice(body, query);
    if (a.err) return json(res, 401, { ok: false, error: a.err });
    await a.cols.devices.updateOne({ _id: a.dev._id }, { $set: { lastSeen: store.nowIso() } });
    const pls = await a.cols.playlists.find({});
    return json(res, 200, { ok: true, playlists: pls.filter((p) => (a.dev.playlists || []).indexOf(p._id) > -1).map(pub) });
  }

  // ---- TV: descargar M3U / EPG asignados (proxy, evita CORS) ----
  if ((pathname === '/api/ott/m3u' || pathname === '/api/ott/epg') && req.method === 'GET') {
    const a = await authedDevice(body, query);
    if (a.err) return json(res, 401, { ok: false, error: a.err });
    const pl = await a.cols.playlists.findOne({ _id: String(query.pid || '') });
    if (!pl || (a.dev.playlists || []).indexOf(pl._id) < 0) return json(res, 403, { ok: false, error: 'No asignada' });
    let target = pathname === '/api/ott/m3u' ? pl.url : (pl.epgUrl || '');
    if (!target) return json(res, 404, { ok: false, error: 'Sin URL' });
    try {
      const text = await fetchText(target);
      res.writeHead(200, { 'Content-Type': pathname === '/api/ott/m3u' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8' });
      res.end(text);
    } catch (e) { return json(res, 502, { ok: false, error: 'No se pudo descargar: ' + e.message }); }
    return;
  }

  // ---- ADMIN: login con usuario+password (no ADMIN_KEY) ----
  if (pathname.indexOf('/api/ott/admin/') === 0) {
    await ensureAdmin(cols);
    const sub = pathname.replace('/api/ott/admin/', '');
    if (sub === 'login' && req.method === 'POST') {
      const u = await cols.users.findOne({ login: String(body.login || '').trim() });
      if (!u || u.role !== 'admin') return json(res, 401, { ok: false, error: 'Credenciales inválidas' });
      const h = store.hashPass(body.password || '', u.salt);
      if (h !== u.pass) return json(res, 401, { ok: false, error: 'Credenciales inválidas' });
      if (u.active === false) return json(res, 403, { ok: false, error: 'Desactivado' });
      return json(res, 200, { ok: true, token: admSign(u._id), name: u.login });
    }
    if (!(await adminAuthed(cols, req))) return json(res, 403, { ok: false, error: 'admin' });
    if (sub === 'overview' && req.method === 'GET') {
      const [users, devices, playlists] = await Promise.all([cols.users.find({}), cols.devices.find({}), cols.playlists.find({})]);
      return json(res, 200, {
        ok: true, mode: cols.mode,
        users: users.filter((u) => u.role !== 'admin').map((u) => ({ id: u._id, login: u.login, active: u.active !== false, expires: u.expires || '', created: u.created })),
        devices: devices.map((d) => ({ id: d._id, userId: d.userId, name: d.name, note: d.note || '', platform: d.platform, playlists: d.playlists || [], lastSeen: d.lastSeen })),
        playlists: playlists.map((p) => ({ id: p._id, name: p.name, url: p.url, epgUrl: p.epgUrl || '' })),
      });
    }
    if (sub === 'user' && req.method === 'POST') {
      // crear (sin id) o actualizar (con id): active, expires, password
      if (body.id) {
        const upd = {};
        if (typeof body.active === 'boolean') upd.active = body.active;
        if (typeof body.expires === 'string') upd.expires = body.expires.slice(0, 10);
        if (body.password) {
          const prev = await cols.users.findOne({ _id: String(body.id) });
          if (!prev) return json(res, 404, { ok: false });
          const salt = crypto.randomBytes(8).toString('hex');
          upd.salt = salt; upd.pass = store.hashPass(body.password, salt);
        }
        await cols.users.updateOne({ _id: String(body.id) }, { $set: upd });
        return json(res, 200, { ok: true });
      }
      const login = String(body.login || '').trim();
      if (!login || !body.password) return json(res, 400, { ok: false, error: 'login+password' });
      if (await cols.users.findOne({ login })) return json(res, 409, { ok: false, error: 'Existe' });
      const salt = crypto.randomBytes(8).toString('hex');
      const u = { _id: store.uid(), login, salt, pass: store.hashPass(body.password, salt), role: 'fake', active: body.active !== false, expires: String(body.expires || '').slice(0, 10), created: store.nowIso() };
      await cols.users.insertOne(u);
      return json(res, 200, { ok: true, id: u._id });
    }
    if (sub === 'user' && req.method === 'DELETE') {
      await cols.users.deleteOne({ _id: String(query.id || '') });
      return json(res, 200, { ok: true });
    }
    if (sub === 'playlist' && req.method === 'POST') {
      if (!body.name || !body.url) return json(res, 400, { ok: false, error: 'name+url' });
      const p = { _id: store.uid(), name: String(body.name), url: String(body.url), epgUrl: String(body.epgUrl || ''), created: store.nowIso() };
      await cols.playlists.insertOne(p);
      return json(res, 200, { ok: true, id: p._id });
    }
    if (sub === 'playlist' && req.method === 'DELETE') {
      await cols.playlists.deleteOne({ _id: String(query.id || '') });
      return json(res, 200, { ok: true });
    }
    if (sub === 'assign' && req.method === 'POST') {
      if (!body.deviceId || !Array.isArray(body.playlistIds)) return json(res, 400, { ok: false, error: 'deviceId+playlistIds' });
      await cols.devices.updateOne({ _id: String(body.deviceId) }, { $set: { playlists: body.playlistIds.map(String) } });
      return json(res, 200, { ok: true });
    }
    if (sub === 'device' && req.method === 'DELETE') {
      await cols.devices.deleteOne({ _id: String(query.id || '') });
      return json(res, 200, { ok: true });
    }
    if (sub === 'device' && req.method === 'PUT') {
      // edición admin: nota interna (no afecta al cliente) y/o reasignar fake-user
      if (!body.id) return json(res, 400, { ok: false, error: 'id' });
      const upd = {};
      if (typeof body.note === 'string') upd.note = body.note.slice(0, 120);
      if (typeof body.name === 'string' && body.name.trim()) upd.name = body.name.trim().slice(0, 60);
      if (typeof body.userId === 'string') {
        const nu = await cols.users.findOne({ _id: body.userId });
        if (!nu) return json(res, 404, { ok: false, error: 'usuario' });
        upd.userId = body.userId;
      }
      await cols.devices.updateOne({ _id: String(body.id) }, { $set: upd });
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { ok: false });
  }

  return json(res, 404, { ok: false });
}

module.exports = { handle };
