'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const sessions = new Map();
const MAX_SESSIONS = Math.max(1, Math.min(2, Number(process.env.VOD_HLS_MAX_SESSIONS) || 2));
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const IDLE_MS = 5 * 60 * 1000;
const MAX_OUTPUT_BYTES = Math.max(128, Number(process.env.VOD_HLS_MAX_MB) || 1024) * 1024 * 1024;
const READY_TIMEOUT_MS = 30000;
const bin = () => process.env.FFMPEG_PATH || require('ffmpeg-static');

function validUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Fuente de video inválida'); }
  if (!/^https?:$/.test(url.protocol) || url.href.length > 4096) throw new Error('Fuente de video inválida');
  return url.href;
}

function ffmpegArgs(url, dir) {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'warning', '-rw_timeout', '15000000',
    '-protocol_whitelist', 'http,https,tcp,tls,crypto', '-analyzeduration', '5000000',
    '-probesize', '5000000', '-i', url,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    '-c:v', 'copy', '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '160k', '-ac', '2', '-ar', '48000',
    '-max_muxing_queue_size', '1024', '-f', 'hls', '-hls_time', '6',
    '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(dir, 'segment-%06d.ts'), path.join(dir, 'index.m3u8')
  ];
}

async function directorySize(dir) {
  let total = 0;
  for (const name of await fs.promises.readdir(dir)) {
    const stat = await fs.promises.stat(path.join(dir, name)).catch(() => null);
    if (stat && stat.isFile()) total += stat.size;
  }
  return total;
}

async function dispose(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (session.child.exitCode === null && session.child.signalCode === null) session.child.kill('SIGKILL');
  await fs.promises.rm(session.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
}

async function prepare(owner, sourceUrl) {
  const url = validUrl(sourceUrl);
  if (!owner) throw new Error('Dispositivo no autorizado');
  for (const session of sessions.values()) if (session.owner === owner) await dispose(session.id);
  if (sessions.size >= MAX_SESSIONS) throw new Error('Hay dos conversiones VOD en curso. Intenta nuevamente.');

  const id = crypto.randomBytes(24).toString('hex');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teamg-vod-'));
  let child;
  try {
    child = spawn(bin(), ffmpegArgs(url, dir), { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new Error('No se pudo iniciar el conversor de video');
  }

  const session = { id, owner, dir, child, created: Date.now(), touched: Date.now(), failed: false, error: '' };
  sessions.set(id, session);
  let stderrTail = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-3000); });
  child.on('error', error => { session.failed = true; session.error = error.message; });
  child.on('close', (code, signal) => {
    session.closed = true;
    if (code !== 0 && !session.failed) {
      const detail = stderrTail.split('\n').map(line => line.trim()).filter(Boolean).slice(-3).join(' | ')
        .replace(/https?:\/\/[^\s]+/g, '[fuente]').slice(-500);
      session.failed = true;
      session.error = 'FFmpeg terminó (' + (signal || code) + ')' + (detail ? ': ' + detail : '');
    }
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  try {
    while (Date.now() < deadline && !session.failed) {
      try {
        const manifest = await fs.promises.readFile(path.join(dir, 'index.m3u8'), 'utf8');
        const segment = manifest.match(/^(segment-\d+\.ts)$/m);
        if (manifest.includes('#EXTINF:') && segment && (await fs.promises.stat(path.join(dir, segment[1])).catch(() => null))) {
          return { sessionId: id, url: '/api/ott/vod-hls/' + id + '/index.m3u8' };
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const reason = session.error || (session.failed ? 'No se pudo leer el MKV' : 'El video tardó demasiado en preparar el primer segmento');
    await dispose(id);
    throw new Error(reason);
  } catch (error) {
    await dispose(id);
    throw error;
  }
}

function stop(owner, id) {
  if (sessions.get(id)?.owner === owner) return dispose(id);
}

async function serve(req, res, pathname) {
  const match = pathname.match(/^\/api\/ott\/vod-hls\/([a-f0-9]{48})\/(index\.m3u8|segment-\d{6,}\.ts)$/);
  const session = match && sessions.get(match[1]);
  if (!session || session.failed || Date.now() - session.created > MAX_AGE_MS) {
    res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); return;
  }
  session.touched = Date.now();
  const file = path.join(session.dir, match[2]);
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': match[2].endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      'Cache-Control': 'private, no-store', 'Content-Length': String(stat.size)
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    res.once('close', () => stream.destroy());
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch {
    if (!res.headersSent) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); }
    else res.destroy();
  }
}

const reaper = setInterval(() => {
  for (const session of sessions.values()) {
    if (Date.now() - session.touched > IDLE_MS || Date.now() - session.created > MAX_AGE_MS) {
      dispose(session.id);
      continue;
    }
    directorySize(session.dir).then(size => { if (size > MAX_OUTPUT_BYTES) dispose(session.id); }).catch(() => {});
  }
}, 10000);
reaper.unref();

module.exports = { prepare, stop, serve, ffmpegArgs };
