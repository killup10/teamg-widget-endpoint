// API del sistema OTT: login de clientes, registro de dispositivos,
// entrega de playlists asignadas y panel admin. Sin dependencias externas.
const crypto = require('crypto');
const store = require('./ott-store');
const artworkFill = require('./artwork-fill');

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

const m3uCache = new Map(); // key: url, value: { text, ts }
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos en memoria para apertura instantánea en TV

async function getCachedOrFetchText(url, forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && m3uCache.has(url)) {
    const entry = m3uCache.get(url);
    if (now - entry.ts < CACHE_TTL_MS) {
      return entry.text;
    }
  }
  const text = await fetchText(url);
  m3uCache.set(url, { text, ts: now });
  return text;
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

      const mSubs = ln.match(/sub-tracks="([^"]*)"/i);
      let subs = mSubs ? mSubs[1] : '';

      const mSeriesLogo = ln.match(/series-logo="([^"]*)"/i);
      const seriesLogo = mSeriesLogo ? mSeriesLogo[1] : '';
      const mPoster = ln.match(/(?:series-poster|tvg-poster|poster|tvg-cover)="([^"]*)"/i);
      const seriesPoster = mPoster ? mPoster[1] : '';
      current = { id: 'c_' + (chId++), name, logo, seriesLogo, seriesPoster, group, adult, subs };
      groupsSet.add(group);
    } else if (ln.indexOf('#EXTGRP:') === 0) {
      if (current) {
        const grp = ln.replace('#EXTGRP:', '').trim();
        if (grp) {
          current.extgrp = grp;
          current.group = grp;
          groupsSet.add(grp);
        }
      }
    } else if (ln.indexOf('#EXTIMG:') === 0) {
      if (current) {
        const img = ln.replace('#EXTIMG:', '').trim();
        if (img) current.logo = img;
      }
    } else if (ln.indexOf('#EXTSUB:') === 0) {
      if (current) {
        const sub = ln.replace('#EXTSUB:', '').trim();
        if (sub) current.subs = sub;
      }
    } else if (ln.charAt(0) !== '#') {
      if (current) {
        current.url = ln;
        channels.push(current);
        current = null;
      }
    }
  }
  return { channels, groups: Array.from(groupsSet) };
}

function mergePlaylistSource(existing, incoming) {
  const result = existing.map(c => ({ ...c }));
  let added = 0, updated = 0;
  const byUrl = new Map(), byName = new Map(), covers = new Map();
  const key = c => String(c.group || '').trim().toLowerCase() + '\n' + String(c.name || '').trim().toLowerCase();
  for (const c of result) {
    if (c.url) byUrl.set(c.url, c);
    const k = key(c); byName.set(k, byName.has(k) ? null : c);
    if (c.seriesLogo || c.seriesPoster) {
      const cover = covers.get(c.group) || {};
      covers.set(c.group, {seriesLogo:c.seriesLogo || cover.seriesLogo || '', seriesPoster:c.seriesPoster || cover.seriesPoster || ''});
    }
  }
  for (const source of incoming) {
    const old = byUrl.get(source.url) || byName.get(key(source));
    const cover = covers.get(source.group) || {};
    if (old) {
      if (old.url !== source.url) { old.url = source.url; updated++; }
      if (!old.logo) old.logo = source.logo || '';
      if (!old.seriesLogo) old.seriesLogo = cover.seriesLogo || source.seriesLogo || '';
      if (!old.seriesPoster) old.seriesPoster = cover.seriesPoster || source.seriesPoster || '';
    } else {
      const c = { ...source, seriesLogo:cover.seriesLogo || source.seriesLogo || '', seriesPoster:cover.seriesPoster || source.seriesPoster || '' };
      result.push(c); if (c.url) byUrl.set(c.url, c); byName.set(key(c), c); added++;
    }
  }
  return { channels: result, added, updated };
}

function serializeChannelsToM3u(channels) {
  let m3u = '#EXTM3U\n';
  for (const c of (channels || [])) {
    const logoAttr = c.logo ? ` tvg-logo="${c.logo}"` : '';
    const seriesLogoAttr = c.seriesLogo ? ` series-logo="${String(c.seriesLogo).replace(/"/g, '%22').replace(/[\r\n]/g, '')}"` : '';
    const seriesPosterAttr = c.seriesPoster ? ` series-poster="${String(c.seriesPoster).replace(/"/g, '%22').replace(/[\r\n]/g, '')}"` : '';
    const groupAttr = c.group ? ` group-title="${c.group}"` : '';
    const adultAttr = c.adult ? ' adult="1"' : '';
    const subAttr = c.subs ? ` sub-tracks="${c.subs}"` : '';
    m3u += `#EXTINF:-1${logoAttr}${seriesLogoAttr}${seriesPosterAttr}${groupAttr}${adultAttr}${subAttr},${c.name}\n`;
    if (c.group) m3u += `#EXTGRP:${c.group}\n`;
    if (c.logo) m3u += `#EXTIMG:${c.logo}\n`;
    if (c.subs) m3u += `#EXTSUB:${c.subs}\n`;
    m3u += `${c.url}\n`;
  }
  return m3u;
}


const HALLOWEEN_ORANGE = '#ff6a00';

function normalizeColor(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  }
  return '';
}

function normalizeBadge(v) {
  return String(v || '').trim().slice(0, 18);
}

function normalizeExpires(v) {
  const s = String(v || '').trim().slice(0, 10);
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const t = Date.parse(s + 'T23:59:59Z');
  if (isNaN(t)) return '';
  return s;
}

function playlistExpired(p, nowMs) {
  if (!p || !p.expiresAt) return false;
  const t = Date.parse(String(p.expiresAt).slice(0, 10) + 'T23:59:59Z');
  if (isNaN(t)) return false;
  return t < (nowMs || Date.now());
}

const pub = (p) => {
  const seriesCovers = [];
  const seen = new Set();
  if (p.customM3u) for (const c of parseM3uText(p.customM3u).channels) {
    if (c.seriesLogo && !seen.has(c.group)) { seriesCovers.push({ group: c.group, logo: c.seriesLogo }); seen.add(c.group); }
  }
  return {
    id: p._id, name: p.name, epg: p.epgUrl || '',
    color: normalizeColor(p.color), badge: normalizeBadge(p.badge),
    expiresAt: normalizeExpires(p.expiresAt), expired: playlistExpired(p),
    seriesCovers,
  };
};

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

async function searchYouTubeTrailer(title) {
  const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(title + ' trailer');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(searchUrl, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    if (!r.ok) return null;
    const text = await r.text();
    const m = text.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function handle(req, res, pathname, query, body) {
  const cols = await store.init();

  // ---- TV: buscar trailer oficial de película o serie ----
  if (pathname === '/api/ott/trailer' && req.method === 'GET') {
    const q = String(query.q || '').trim();
    if (!q) return json(res, 400, { ok: false, error: 'Falta parametro q' });
    const videoId = await searchYouTubeTrailer(q);
    if (videoId) {
      return json(res, 200, {
        ok: true,
        videoId: videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&rel=0&modestbranding=1',
        watchUrl: 'https://www.youtube.com/watch?v=' + videoId
      });
    }
    return json(res, 404, { ok: false, error: 'No se encontro trailer para ' + q });
  }

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
    const mine = pls.filter((p) => (dev.playlists || []).indexOf(p._id) > -1 && !playlistExpired(p)).map(pub);
    return json(res, 200, { ok: true, device: { id: dev._id, name: dev.name }, playlists: mine });
  }

  // ---- TV: botón rojo = refrescar carpetas asignadas ----
  if (pathname === '/api/ott/feed' && req.method === 'GET') {
    const a = await authedDevice(body, query);
    if (a.err) return json(res, 401, { ok: false, error: a.err });
    await a.cols.devices.updateOne({ _id: a.dev._id }, { $set: { lastSeen: store.nowIso() } });
    const pls = await a.cols.playlists.find({});
    return json(res, 200, { ok: true, playlists: pls.filter((p) => (a.dev.playlists || []).indexOf(p._id) > -1 && !playlistExpired(p)).map(pub) });
  }

  // ---- TV: descargar M3U / EPG asignados (proxy, evita CORS) ----
  if ((pathname === '/api/ott/m3u' || pathname === '/api/ott/epg') && req.method === 'GET') {
    const a = await authedDevice(body, query);
    if (a.err) return json(res, 401, { ok: false, error: a.err });
    const pl = await a.cols.playlists.findOne({ _id: String(query.pid || '') });
    if (!pl || (a.dev.playlists || []).indexOf(pl._id) < 0) return json(res, 403, { ok: false, error: 'No asignada' });
    if (playlistExpired(pl)) return json(res, 410, { ok: false, error: 'Lista expirada' });
    if (pathname === '/api/ott/m3u' && pl.customM3u) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(pl.customM3u);
      return;
    }
    let target = pathname === '/api/ott/m3u' ? pl.url : (pl.epgUrl || '');
    if (!target) return json(res, 404, { ok: false, error: 'Sin URL' });
    try {
      const isFresh = (query.refresh === '1' || !!query._cb);
      const text = await getCachedOrFetchText(target, isFresh);
      res.writeHead(200, {
        'Content-Type': pathname === '/api/ott/m3u' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
        'Cache-Control': pathname === '/api/ott/m3u' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=300'
      });
      res.end(text);
    } catch (e) { return json(res, 502, { ok: false, error: 'No se pudo descargar: ' + e.message }); }
    return;
  }

// Helper para realizar peticiones HTTP/HTTPS siguiendo redirecciones (301, 302, 307, 308)
function fetchWithRedirects(targetUrl, options, maxRedirects, callback) {
  if (typeof maxRedirects === 'function') {
    callback = maxRedirects;
    maxRedirects = 5;
  }
  if (maxRedirects <= 0) {
    return callback(new Error('Demasiadas redirecciones'));
  }

  // Desempaquetar si viene envuelto en /api/ott/stream?url=
  let cleanUrl = targetUrl;
  if (cleanUrl.indexOf('api/ott/stream') !== -1 && cleanUrl.indexOf('url=') !== -1) {
    try {
      const u = new URL(cleanUrl, 'http://localhost');
      const inner = u.searchParams.get('url');
      if (inner) cleanUrl = inner;
    } catch (eU) {}
  }

  try {
    const parsed = new URL(cleanUrl);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? require('https') : require('http');
    const reqHeaders = Object.assign({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }, options.headers || {});

    const req = mod.request(cleanUrl, {
      method: options.method || 'GET',
      headers: reqHeaders,
      rejectUnauthorized: false,
      timeout: options.timeout || 30000
    }, (res) => {
      // Manejar redirecciones 301, 302, 303, 307, 308
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, cleanUrl).toString();
        res.resume();
        return fetchWithRedirects(redirectUrl, options, maxRedirects - 1, callback);
      }
      callback(null, res, req, cleanUrl);
    });

    req.on('error', (err) => callback(err));
    req.on('timeout', () => {
      try { req.destroy(); } catch (e) {}
      callback(new Error('Timeout de conexion'));
    });
    req.end();
  } catch (err) {
    callback(err);
  }
}

  // Embedded subtitle extraction is an offline/admin operation, never a playback request.
  if (pathname === '/api/ott/tracks' && req.method === 'GET') {
    return json(res, 200, {ok:true, tracks:[], audioTracks:[], nativeOnly:true});
  }
  if (pathname.indexOf('/api/ott/subtitle/') === 0 && req.method === 'GET') {
    const id = pathname.slice('/api/ott/subtitle/'.length).replace(/\.vtt$/, '');
    const saved = await cols.icons.findOne({_id:id});
    if (!saved || saved.type !== 'subtitle') return json(res, 404, {ok:false});
    res.writeHead(200, {'Content-Type':'text/vtt; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'public, max-age=86400'});
    return res.end(saved.text);
  }
  if (pathname === '/api/ott/subtitles' && req.method === 'GET') {
    const target = String(query.url || '').trim();
    let parsed;
    try { parsed = new URL(target); } catch (e) { return json(res, 400, {ok:false,error:'URL inválida'}); }
    if (!/^https?:$/.test(parsed.protocol) || !/\.(srt|vtt)$/i.test(parsed.pathname)) {
      return json(res, 422, {ok:false,error:'Usa una pista nativa de la TV o un archivo externo SRT/VTT preparado.'});
    }
    let finished = false, request, upstream, chunks = [], bytes = 0;
    function fail(code) {
      if (finished) return;
      finished = true; clearTimeout(deadline);
      if (upstream) upstream.destroy(); if (request) request.destroy();
      return json(res, code, {ok:false,error:'No se pudo cargar el subtítulo externo.'});
    }
    const deadline = setTimeout(() => fail(504), 15000);
    res.on && res.on('close', () => { if (!finished) { finished=true; clearTimeout(deadline); if (upstream) upstream.destroy(); if (request) request.destroy(); } });
    fetchWithRedirects(target, {timeout:12000}, 5, (err, upRes, upReq) => {
      if (finished) { if (upRes) upRes.destroy(); if (upReq) upReq.destroy(); return; }
      request = upReq; upstream = upRes;
      if (err || !upRes || upRes.statusCode !== 200) return fail(502);
      upRes.on('data', chunk => { bytes += chunk.length; if (bytes > 2097152) return fail(413); chunks.push(chunk); });
      upRes.on('error', () => fail(502));
      upRes.on('end', () => {
        if (finished) return;
        let vtt;
        try { vtt = require('./subtitle-utils').toVtt(Buffer.concat(chunks).toString('utf8')); } catch(e) { return fail(422); }
        finished = true; clearTimeout(deadline);
        res.writeHead(200, {'Content-Type':'text/vtt; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=86400'});
        res.end(vtt);
      });
    });
    return;
  }

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
        'Access-Control-Allow-Origin': '*',
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
        playlists: playlists.map((p) => ({ id: p._id, name: p.name, url: p.url, epgUrl: p.epgUrl || '', color: normalizeColor(p.color), badge: normalizeBadge(p.badge), expiresAt: normalizeExpires(p.expiresAt), expired: playlistExpired(p) })),
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
      // crear (sin id) o actualizar (con id): nombre + color/badge/expires para especiales como Halloween
      const color = normalizeColor(body.color);
      const badge = normalizeBadge(body.badge);
      const expiresAt = normalizeExpires(body.expiresAt || body.expires);
      if (body.id) {
        const prev = await cols.playlists.findOne({ _id: String(body.id) });
        if (!prev) return json(res, 404, { ok: false });
        const upd = { updatedAt: store.nowIso() };
        if (typeof body.name === 'string' && body.name.trim()) upd.name = String(body.name).trim().slice(0, 80);
        if (typeof body.url === 'string' && body.url.trim()) upd.url = String(body.url).trim();
        if (typeof body.epgUrl === 'string') upd.epgUrl = String(body.epgUrl || '');
        if (body.color !== undefined) upd.color = color;
        if (body.badge !== undefined) upd.badge = badge;
        if (body.expiresAt !== undefined || body.expires !== undefined) upd.expiresAt = expiresAt;
        await cols.playlists.updateOne({ _id: String(body.id) }, { $set: upd });
        return json(res, 200, { ok: true, id: String(body.id) });
      }
      if (!body.name || !body.url) return json(res, 400, { ok: false, error: 'name+url' });
      const p = { _id: store.uid(), name: String(body.name).trim().slice(0, 80), url: String(body.url), epgUrl: String(body.epgUrl || ''), color, badge, expiresAt, created: store.nowIso() };
      await cols.playlists.insertOne(p);
      return json(res, 200, { ok: true, id: p._id });
    }
    if (sub === 'playlist/halloween' && req.method === 'POST') {
      // Atajo: crea o actualiza la playlist especial Halloween en naranja #ff6a00 con caducidad 02-nov.
      const year = new Date().getFullYear();
      const expiresAt = normalizeExpires(body.expiresAt) || (year + '-11-02');
      const url = String(body.url || '').trim();
      if (!url) return json(res, 400, { ok: false, error: 'url' });
      const name = String(body.name || '🎃 Halloween').trim().slice(0, 80) || '🎃 Halloween';
      const prev = (await cols.playlists.find({})).filter((x) => /halloween/i.test(x.name || '') || normalizeBadge(x.badge) === 'HALLOWEEN')[0] || null;
      if (prev) {
        await cols.playlists.updateOne({ _id: prev._id }, { $set: { name, url, color: HALLOWEEN_ORANGE, badge: 'HALLOWEEN', expiresAt, updatedAt: store.nowIso() } });
        return json(res, 200, { ok: true, id: prev._id, reused: true });
      }
      const p = { _id: store.uid(), name, url, epgUrl: String(body.epgUrl || ''), color: HALLOWEEN_ORANGE, badge: 'HALLOWEEN', expiresAt, created: store.nowIso() };
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
          text = await getCachedOrFetchText(pl.url, query.refresh === '1');
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

    if (sub === 'playlist/export' && req.method === 'POST') {
      const pl = await cols.playlists.findOne({ _id: String(body.id || '') });
      if (!pl) return json(res, 404, { ok: false, error: 'Lista no encontrada' });
      const text = pl.customM3u || (pl.url ? await getCachedOrFetchText(pl.url, false) : '#EXTM3U\n');
      return json(res, 200, { ok: true, name: pl.name, content: text, revision: artworkFill.revision(text) });
    }
    if (sub === 'playlist/fill-artwork' && req.method === 'POST') {
      const pl = await cols.playlists.findOne({ _id: String(body.id || '') });
      if (!pl || !Array.isArray(body.entries) || body.entries.length > 100) return json(res, 400, { ok: false, error: 'Lote inválido' });
      const text = pl.customM3u || (pl.url ? await getCachedOrFetchText(pl.url, false) : '#EXTM3U\n');
      if (artworkFill.revision(text) !== body.revision) return json(res, 409, { ok: false, error: 'La lista cambió; vuelve a cargarla' });
      const images = new Map();
      const hostHeader = req.headers.host || 'ott.teamg.store';
      for (const entry of body.entries) {
        if (!entry.data) continue;
        if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(entry.data) || entry.data.length > 150000) return json(res, 400, {ok:false,error:'Imagen inválida o demasiado grande'});
        const bytes = Buffer.from(entry.data.split(',')[1], 'base64');
        if (bytes[0] !== 255 || bytes[1] !== 216) return json(res, 400, {ok:false,error:'Formato JPEG inválido'});
        const id = 'artwork_' + crypto.createHash('sha256').update(bytes).digest('hex');
        images.set(id, entry.data);
        entry.logo = 'https://' + hostHeader + '/api/ott/icon/' + id;

        if (entry.posterData) {
          if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(entry.posterData) || entry.posterData.length > 150000) return json(res, 400, {ok:false,error:'Póster inválido o demasiado grande'});
          const pBytes = Buffer.from(entry.posterData.split(',')[1], 'base64');
          if (pBytes[0] !== 255 || pBytes[1] !== 216) return json(res, 400, {ok:false,error:'Formato JPEG de póster inválido'});
          const pId = 'artwork_' + crypto.createHash('sha256').update(pBytes).digest('hex');
          images.set(pId, entry.posterData);
          entry.seriesPoster = 'https://' + hostHeader + '/api/ott/icon/' + pId;
        }
        if (entry.seriesLogoData) {
          if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(entry.seriesLogoData) || entry.seriesLogoData.length > 150000) return json(res, 400, {ok:false,error:'Carátula de serie inválida'});
          const sBytes = Buffer.from(entry.seriesLogoData.split(',')[1], 'base64');
          if (sBytes[0] !== 255 || sBytes[1] !== 216) return json(res, 400, {ok:false,error:'Formato JPEG de carátula de serie inválido'});
          const sId = 'artwork_' + crypto.createHash('sha256').update(sBytes).digest('hex');
          images.set(sId, entry.seriesLogoData);
          entry.seriesLogo = 'https://' + hostHeader + '/api/ott/icon/' + sId;
        } else if (entry.isSeries) {
          entry.seriesLogo = entry.logo;
        }
      }
      let patched;
      try { patched = artworkFill.fillArtwork(text, body.entries); }
      catch (e) { return json(res, 400, { ok: false, error: e.message }); }
      // Content-addressed images make retries and repeated titles inexpensive.
      const imageRows = Array.from(images.entries());
      for (let offset = 0; offset < imageRows.length; offset += 4) {
        await Promise.all(imageRows.slice(offset, offset + 4).map(async ([id, data]) => {
          if (!(await cols.icons.findOne({_id:id}))) {
            try { await cols.icons.insertOne({_id:id, data, created:store.nowIso()}); }
            catch (e) { if (e.code !== 11000) throw e; }
          }
        }));
      }
      const filter = { _id: pl._id };
      if (pl.customM3u != null) filter.customM3u = pl.customM3u;
      else if (cols.mode === 'mongo') filter.customM3u = { $exists: false };
      const result = await cols.playlists.updateOne(filter, { $set: {
        customM3u: patched.text, artworkBackup: pl.artworkBackup || text,
        updatedAt: store.nowIso()
      } });
      if (!result.matchedCount) return json(res, 409, { ok: false, error: 'Edición simultánea; vuelve a cargar la lista' });
      if (pl.url) m3uCache.delete(pl.url);
      return json(res, 200, { ok: true, changed: patched.changed, preserved: patched.preserved, revision: artworkFill.revision(patched.text) });
    }
    if (sub === 'playlist/sync-source' && req.method === 'POST') {
      const pl = await cols.playlists.findOne({ _id: String(body.id || '') });
      if (!pl || !pl.url) return json(res, 400, { ok: false, error: 'La lista no tiene una fuente configurada' });
      let source;
      try { source = await getCachedOrFetchText(pl.url, true); }
      catch (e) { return json(res, 502, { ok: false, error: 'No se pudo descargar la fuente' }); }
      const incoming = parseM3uText(source).channels;
      if (!incoming.length) return json(res, 400, { ok: false, error: 'La fuente no contiene canales válidos; no se modificó la lista' });
      const merged = mergePlaylistSource(parseM3uText(pl.customM3u || source).channels, incoming);
      const text = serializeChannelsToM3u(merged.channels);
      await cols.playlists.updateOne({ _id: pl._id }, { $set: { customM3u: text, count: merged.channels.length, updatedAt: store.nowIso() } });
      const parsed = parseM3uText(text);
      return json(res, 200, { ok: true, channels: parsed.channels, groups: parsed.groups, added: merged.added, updated: merged.updated });
    }
    if (sub === 'playlist/save-channels' && req.method === 'POST') {
      if (!body.id || !Array.isArray(body.channels)) return json(res, 400, { ok: false, error: 'id+channels' });
      const prevPl = await cols.playlists.findOne({ _id: String(body.id) });
      if (prevPl && prevPl.url) m3uCache.delete(prevPl.url);
      const host = req.headers.host || 'ott.teamg.store';
      for (const ch of body.channels) {
        if (ch.logo) {
          if (ch.logo.startsWith('/api/ott/icon/')) ch.logo = 'https://' + host + ch.logo;
          if (ch.logo.includes('teamg-widget-endpoint.onrender.com/api/ott/icon/')) {
            ch.logo = ch.logo.replace('https://teamg-widget-endpoint.onrender.com', 'https://' + host);
          }
        }
        if (ch.seriesLogo) {
          if (ch.seriesLogo.startsWith('/api/ott/icon/')) ch.seriesLogo = 'https://' + host + ch.seriesLogo;
          if (ch.seriesLogo.includes('teamg-widget-endpoint.onrender.com/api/ott/icon/')) {
            ch.seriesLogo = ch.seriesLogo.replace('https://teamg-widget-endpoint.onrender.com', 'https://' + host);
          }
        }
        if (ch.seriesPoster) {
          if (ch.seriesPoster.startsWith('/api/ott/icon/')) ch.seriesPoster = 'https://' + host + ch.seriesPoster;
          if (ch.seriesPoster.includes('teamg-widget-endpoint.onrender.com/api/ott/icon/')) {
            ch.seriesPoster = ch.seriesPoster.replace('https://teamg-widget-endpoint.onrender.com', 'https://' + host);
          }
        }
      }
      const m3uText = serializeChannelsToM3u(body.channels);
      await cols.playlists.updateOne({ _id: String(body.id) }, { $set: { customM3u: m3uText, count: body.channels.length, updatedAt: store.nowIso() } });
      return json(res, 200, { ok: true, count: body.channels.length });
    }

    if (sub === 'upload-subtitle' && req.method === 'POST') {
      let text;
      try { text = require('./subtitle-utils').toVtt(body.text); }
      catch (e) { return json(res, 400, {ok:false,error:e.message}); }
      const id = 'subtitle_' + require('crypto').createHash('sha256').update(text).digest('hex');
      if (!await cols.icons.findOne({_id:id})) {
        try { await cols.icons.insertOne({_id:id,type:'subtitle',text,created:store.nowIso()}); }
        catch(e) { if (e.code !== 11000) throw e; }
      }
      const host = req.headers.host || 'ott.teamg.store';
      return json(res, 200, {ok:true,url:'https://' + host + '/api/ott/subtitle/' + id + '.vtt'});
    }

    if (sub === 'prepare-image' && req.method === 'POST') {
      let bytes;
      try { bytes = await require('./media-import').prepareImage(body); }
      catch(e) { return json(res, 400, {ok:false,error:e.message}); }
      const id = 'image_' + crypto.createHash('sha256').update(bytes).digest('hex');
      if (!await cols.icons.findOne({_id:id})) {
        try { await cols.icons.insertOne({_id:id,data:'data:image/jpeg;base64,' + bytes.toString('base64'),created:store.nowIso()}); }
        catch(e) { if(e.code!==11000) throw e; }
      }
      return json(res,200,{ok:true,url:'https://' + (req.headers.host || 'ott.teamg.store') + '/api/ott/icon/' + id});
    }

    if (sub === 'upload-image' && req.method === 'POST') {
      if (!body.data) return json(res, 400, { ok: false, error: 'Falta data' });
      let dataToSave = body.data;
      try {
        const bytes = await require('./media-import').prepareImage({ data: body.data, shape: body.shape || 'horizontal' });
        dataToSave = 'data:image/jpeg;base64,' + bytes.toString('base64');
      } catch (err) {}
      const iconId = store.uid();
      await cols.icons.insertOne({ _id: iconId, data: dataToSave, created: store.nowIso() });
      const hostHeader = (req && req.headers && req.headers['host']) ? req.headers['host'] : 'ott.teamg.store';
      const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
      const fullUrl = proto + '://' + hostHeader + '/api/ott/icon/' + iconId;
      return json(res, 200, { ok: true, url: fullUrl, relUrl: fullUrl, id: iconId });
    }

    return json(res, 404, { ok: false });
  }

  return json(res, 404, { ok: false });
}

function handleStream(req, res, query) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept, User-Agent',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

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

  const clientReq = mod.request(targetUrl, {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    rejectUnauthorized: false,
    timeout: 30000
  }, (upRes) => {
    upRes.on('error', (err) => {
      console.error('[StreamProxy Upstream Error]:', err.message);
      try { res.destroy(); } catch (e) {}
    });
    if (upRes.statusCode >= 300 && upRes.statusCode < 400 && upRes.headers.location) {
      try {
        upRes.resume();
        const { URL } = require('url');
        const redirectUrl = new URL(upRes.headers.location, targetUrl).href;
        return handleStream(req, res, { url: redirectUrl, manifestOnly: query.manifestOnly });
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
            // Read only the playlist through our origin; video remains direct.
            if (query.manifestOnly === '1') return absChunk;
            const ext = (absChunk.indexOf('.m3u8') !== -1 || absChunk.indexOf('chunks') !== -1 || absChunk.indexOf('playlist') !== -1) ? '.m3u8' : '.ts';
            const hostHeader = (req && req.headers && req.headers.host) ? req.headers.host : 'ott.teamg.store';
            const proto = (req && req.headers && req.headers['x-forwarded-proto']) ? req.headers['x-forwarded-proto'].split(',')[0].trim() : 'https';
            return proto + '://' + hostHeader + '/api/ott/stream' + ext + '?url=' + encodeURIComponent(absChunk);
          } catch (e) {
            return l;
          }
        }).join('\n');

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept, User-Agent',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(rewritten);
      });
    } else {
      const lowerUrl = targetUrl.toLowerCase();
      let outContentType = 'video/mp4';
      if (lowerUrl.indexOf('.mkv') !== -1 || contentType.indexOf('matroska') !== -1) {
        outContentType = 'video/x-matroska';
      } else if (lowerUrl.indexOf('.mp4') !== -1 || contentType.indexOf('mp4') !== -1) {
        outContentType = 'video/mp4';
      } else if (lowerUrl.indexOf('.webm') !== -1 || contentType.indexOf('webm') !== -1) {
        outContentType = 'video/webm';
      } else if (lowerUrl.indexOf('.avi') !== -1 || contentType.indexOf('avi') !== -1) {
        outContentType = 'video/x-msvideo';
      } else if (lowerUrl.indexOf('.mov') !== -1 || contentType.indexOf('quicktime') !== -1) {
        outContentType = 'video/quicktime';
      } else if (lowerUrl.indexOf('.ts') !== -1 || lowerUrl.indexOf('.m2ts') !== -1 || contentType.indexOf('mp2t') !== -1) {
        outContentType = 'video/mp2t';
      } else if (contentType && contentType.indexOf('octet-stream') === -1 && contentType.indexOf('text/') === -1) {
        outContentType = contentType;
      }

      const outHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept, User-Agent',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
        'Content-Type': outContentType,
        'Accept-Ranges': 'bytes'
      };
      if (upRes.headers['content-length']) outHeaders['Content-Length'] = upRes.headers['content-length'];
      if (upRes.headers['content-range']) outHeaders['Content-Range'] = upRes.headers['content-range'];
      if (upRes.headers['accept-ranges']) {
        outHeaders['Accept-Ranges'] = upRes.headers['accept-ranges'];
      }

      res.writeHead(upRes.statusCode || 200, outHeaders);
      if (req.method === 'HEAD') {
        upRes.resume();
        return res.end();
      }
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
  clientReq.end();
}

module.exports = { handle, handleStream, normalizeColor, normalizeBadge, normalizeExpires, playlistExpired, HALLOWEEN_ORANGE };
