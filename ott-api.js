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
    const candidates = [secret(), 'dev-secret'].filter(Boolean);
    let okSig = false;
    for (const sec of candidates) {
      const sig = crypto.createHmac('sha256', sec).update(p[1]).digest('hex');
      if (sig === p[2]) { okSig = true; break; }
    }
    if (!okSig) return null;
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

function parseM3uText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const channels = [];
  const groupsSet = new Set();
  let current = null;
  let chId = 1;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) continue;
    if (ln.indexOf('#EXTINF') === 0) {
      const parts = ln.split(',');
      const name = (parts.length > 1 ? parts.slice(1).join(',') : 'Canal').trim();
      let logo = '';
      let group = 'General';
      let adult = false;

      const mLogo = ln.match(/tvg-logo="([^"]*)"/i);
      if (mLogo) logo = mLogo[1];
      const mGroup = ln.match(/group-title="([^"]*)"/i);
      if (mGroup && mGroup[1].trim()) group = mGroup[1].trim();
      if (/adult="1"|censored="1"/i.test(ln) || /18\+|adult/i.test(group)) adult = true;

      current = { id: 'c_' + (chId++), name, logo, group, adult };
      groupsSet.add(group);
    } else if (ln.indexOf('#EXTGRP:') === 0) {
      if (current) {
        const grp = ln.replace('#EXTGRP:', '').trim();
        if (grp) {
          current.group = grp;
          groupsSet.add(grp);
        }
      }
    } else if (ln.indexOf('#EXTIMG:') === 0) {
      if (current) {
        const img = ln.replace('#EXTIMG:', '').trim();
        if (img) current.logo = img;
      }
    } else if (ln.charAt(0) !== '#') {
      if (current) {
        current.url = ln;
        channels.push(current);
        current = null;
      }
    }
  }
  return { channels, groups: Array.from(groupsSet).sort() };
}

function serializeChannelsToM3u(channels) {
  let m3u = '#EXTM3U\n';
  for (const c of (channels || [])) {
    const logoAttr = c.logo ? ` tvg-logo="${c.logo}"` : '';
    const groupAttr = c.group ? ` group-title="${c.group}"` : '';
    const adultAttr = c.adult ? ' adult="1"' : '';
    m3u += `#EXTINF:-1${logoAttr}${groupAttr}${adultAttr},${c.name}\n`;
    if (c.group) m3u += `#EXTGRP:${c.group}\n`;
    m3u += `${c.url}\n`;
  }
  return m3u;
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
    if (pathname === '/api/ott/m3u' && pl.customM3u) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(pl.customM3u);
      return;
    }
    let target = pathname === '/api/ott/m3u' ? pl.url : (pl.epgUrl || '');
    if (!target) return json(res, 404, { ok: false, error: 'Sin URL' });
    try {
      const text = await fetchText(target);
      res.writeHead(200, { 'Content-Type': pathname === '/api/ott/m3u' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8' });
      res.end(text);
    } catch (e) { return json(res, 502, { ok: false, error: 'No se pudo descargar: ' + e.message }); }
    return;
  }

  // ---- Icono público subido por el admin ----
  if (pathname.indexOf('/api/ott/icon/') === 0 && req.method === 'GET') {
    const iconId = pathname.replace('/api/ott/icon/', '').trim();
    if (!iconId) return json(res, 404, { ok: false });
    const icon = await cols.icons.findOne({ _id: iconId });
    if (!icon || !icon.data) return json(res, 404, { ok: false });
    try {
      const parts = String(icon.data).split(',');
      const mime = (parts[0] && parts[0].match(/:(.*?);/)) ? parts[0].match(/:(.*?);/)[1] : 'image/png';
      const buf = Buffer.from(parts[1] || parts[0], 'base64');
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      res.end(buf);
      return;
    } catch (e) {
      return json(res, 500, { ok: false });
    }
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
    if (sub === 'playlist/channels' && req.method === 'GET') {
      const pl = await cols.playlists.findOne({ _id: String(query.id || '') });
      if (!pl) return json(res, 404, { ok: false, error: 'Lista no encontrada' });
      let text = pl.customM3u || '';
      if (!text && pl.url) {
        try {
          text = await fetchText(pl.url);
        } catch (e) {
          return json(res, 502, { ok: false, error: 'No se pudo descargar la lista original: ' + e.message });
        }
      }
      const parsed = parseM3uText(text || '');
      return json(res, 200, {
        ok: true,
        playlist: { id: pl._id, name: pl.name, url: pl.url },
        channels: parsed.channels,
        groups: parsed.groups
      });
    }

    if (sub === 'playlist/save-channels' && req.method === 'POST') {
      if (!body.id || !Array.isArray(body.channels)) return json(res, 400, { ok: false, error: 'id+channels' });
      const m3uText = serializeChannelsToM3u(body.channels);
      await cols.playlists.updateOne({ _id: String(body.id) }, { $set: { customM3u: m3uText, count: body.channels.length, updatedAt: store.nowIso() } });
      return json(res, 200, { ok: true, count: body.channels.length });
    }

    if (sub === 'upload-image' && req.method === 'POST') {
      if (!body.data) return json(res, 400, { ok: false, error: 'Falta data' });
      const iconId = store.uid();
      await cols.icons.insertOne({ _id: iconId, data: body.data, created: store.nowIso() });
      return json(res, 200, { ok: true, url: '/api/ott/icon/' + iconId });
    }

    return json(res, 404, { ok: false });
  }

  return json(res, 404, { ok: false });
}

function handleStream(req, res, query) {
  const targetUrl = String(query.url || '').trim();
  if (!targetUrl || (targetUrl.indexOf('http://') !== 0 && targetUrl.indexOf('https://') !== 0)) {
    res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('Invalid URL');
  }

  const isHttps = targetUrl.indexOf('https://') === 0;
  const mod = isHttps ? require('https') : require('http');

  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (SmartTV; NetCast) AppleWebKit/534.34',
    'Accept': '*/*'
  };
  if (req.headers.range) {
    headers['range'] = req.headers.range;
  }

  const clientReq = mod.get(targetUrl, {
    headers,
    rejectUnauthorized: false,
    timeout: 15000
  }, (upRes) => {
    upRes.on('error', (err) => {
      console.error('[StreamProxy Upstream Error]:', err.message);
      try { res.destroy(); } catch (e) {}
    });
    if (upRes.statusCode >= 300 && upRes.statusCode < 400 && upRes.headers.location) {
      try {
        const { URL } = require('url');
        const redirectUrl = new URL(upRes.headers.location, targetUrl).href;
        return handleStream(req, res, { url: redirectUrl });
      } catch (e) {}
    }

    const contentType = (upRes.headers['content-type'] || '').toLowerCase();
    const isM3u8 = contentType.indexOf('mpegurl') !== -1 ||
                   targetUrl.indexOf('.m3u8') !== -1 ||
                   targetUrl.indexOf('/chunks.') !== -1 ||
                   targetUrl.indexOf('/playlist.') !== -1;

    if (isM3u8) {
      let m3uData = '';
      upRes.on('data', (chunk) => { m3uData += chunk; });
      upRes.on('end', () => {
        if (m3uData.indexOf('#EXTM3U') === -1 && m3uData.length > 0 && m3uData.charCodeAt(0) === 0x47) {
          res.writeHead(200, {
            'Content-Type': 'video/mp2t',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(Buffer.from(m3uData, 'binary'));
        }

        const { URL } = require('url');
        const lines = m3uData.split(/\r?\n/);
        const rewritten = lines.map((line) => {
          const l = line.trim();
          if (!l) return line;
          if (l.indexOf('#EXT-X-KEY:') === 0) {
            return l.replace(/URI="(.*?)"/i, (match, uri) => {
              try {
                const absKey = new URL(uri, targetUrl).href;
                return 'URI="/api/ott/stream?url=' + encodeURIComponent(absKey) + '"';
              } catch (e) { return match; }
            });
          }
          if (l.charAt(0) === '#') return line;
          try {
            const absChunk = new URL(l, targetUrl).href;
            const ext = (absChunk.indexOf('.m3u8') !== -1 || absChunk.indexOf('chunks') !== -1 || absChunk.indexOf('playlist') !== -1) ? '.m3u8' : '.ts';
            return '/api/ott/stream' + ext + '?url=' + encodeURIComponent(absChunk);
          } catch (e) {
            return l;
          }
        }).join('\n');

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(rewritten);
      });
    } else {
      const outHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': contentType || 'video/mp2t'
      };
      if (upRes.headers['content-length']) outHeaders['Content-Length'] = upRes.headers['content-length'];
      if (upRes.headers['content-range']) outHeaders['Content-Range'] = upRes.headers['content-range'];
      if (upRes.headers['accept-ranges']) outHeaders['Accept-Ranges'] = upRes.headers['accept-ranges'];

      res.writeHead(upRes.statusCode || 200, outHeaders);
      upRes.pipe(res);
    }
  });

  clientReq.on('timeout', () => {
    clientReq.destroy(new Error('Conexión expiró (timeout)'));
  });

  clientReq.on('error', (err) => {
    console.error('[StreamProxy Error]:', err.message, targetUrl);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end('Error al conectar con el stream: ' + err.message);
    }
  });

  if (req && typeof req.on === 'function') {
    req.on('close', () => {
      try { clientReq.destroy(); } catch (e) {}
    });
  }
}

module.exports = { handle, handleStream };
