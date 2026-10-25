'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const sessions = new Map();
const videoCodecCache = new Map();
const MAX_SESSIONS = Math.max(1, Math.min(4, Number(process.env.VOD_HLS_MAX_SESSIONS) || 4));
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const IDLE_MS = 5 * 60 * 1000;
const MAX_OUTPUT_BYTES = Math.max(128, Number(process.env.VOD_HLS_MAX_MB) || 3072) * 1024 * 1024;
const READY_TIMEOUT_MS = 30000;
const bin = () => process.env.FFMPEG_PATH || require('ffmpeg-static');

function validUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Fuente de video inválida'); }
  if (!/^https?:$/.test(url.protocol) || url.href.length > 4096) throw new Error('Fuente de video inválida');
  return url.href;
}

async function detectVideoTranscode(url) {
  const cached = videoCodecCache.get(url);
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) return cached.transcodeVideo;

  let decided = null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(url, { headers: { Range: 'bytes=0-65535' }, signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok || res.status === 206) {
      const buf = Buffer.from(await res.arrayBuffer());
      const ascii = buf.toString('latin1');
      if (ascii.includes('V_MPEGH/ISO/HEVC') || ascii.includes('V_VP9') || ascii.includes('V_AV1') ||
          ascii.includes('V_MPEG2') || ascii.includes('V_MS/VFW/FOURCC')) {
        decided = true;
      } else if (ascii.includes('V_MPEG4/ISO/AVC')) {
        const idx = buf.indexOf(Buffer.from('V_MPEG4/ISO/AVC'));
        const sub = buf.subarray(idx, Math.min(buf.length, idx + 512));
        decided = false;
        for (let i = 0; i < sub.length - 6; i++) {
          if (sub[i] === 0x01 && (sub[i + 4] & 0xfc) === 0xfc && (sub[i + 5] & 0xe0) === 0xe0) {
            if (sub[i + 1] > 100) decided = true;
            break;
          }
        }
      }
    }
  } catch {}

  if (decided === null) {
    decided = await new Promise(resolve => {
      let stderr = '';
      let child;
      try {
        child = spawn(bin(), [
          '-hide_banner', '-nostdin', '-loglevel', 'info', '-rw_timeout', '8000000',
          '-protocol_whitelist', 'http,https,tcp,tls,crypto',
          '-analyzeduration', '1500000', '-probesize', '1500000',
          '-i', url, '-map', '0:v:0', '-c:v', 'copy', '-t', '0', '-f', 'null', '-'
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      } catch {
        return resolve(false);
      }
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 6000);
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-16384); });
      child.on('error', () => { clearTimeout(timer); resolve(false); });
      child.on('close', () => {
        clearTimeout(timer);
        const m = stderr.match(/Stream #\d+:\d+[^\n]*Video:\s*([a-z0-9_]+)([^\n]*)/i);
        if (!m) return resolve(false);
        const codec = m[1].toLowerCase();
        const details = m[2] || '';
        const is10Bit = /10le|10be|yuv420p10|main 10|high 10|hi10p/i.test(details);
        resolve(codec !== 'h264' || is10Bit);
      });
    });
  }

  if (videoCodecCache.size >= 512) videoCodecCache.delete(videoCodecCache.keys().next().value);
  videoCodecCache.set(url, { transcodeVideo: decided, ts: Date.now() });
  return decided;
}

function ffmpegArgs(url, dir, options) {
  const transcodeVideo = Boolean(options && options.transcodeVideo);
  const videoArgs = transcodeVideo
    ? [
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        '-maxrate', '3800k', '-bufsize', '7600k',
        '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
        '-vf', 'scale=min(1920\\,iw):-2',
        '-g', '96', '-keyint_min', '48', '-sc_threshold', '0'
      ]
    : ['-c:v', 'copy'];

  return [
    '-hide_banner', '-nostdin', '-loglevel', 'warning', '-rw_timeout', '15000000',
    '-protocol_whitelist', 'http,https,tcp,tls,crypto', '-analyzeduration', '2000000',
    '-probesize', '2000000', '-i', url,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    ...videoArgs,
    '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '160k', '-ac', '2', '-ar', '48000',
    '-max_muxing_queue_size', '1024', '-f', 'hls', '-hls_time', '4', '-hls_list_size', '0',
    '-hls_playlist_type', 'event', '-hls_flags', 'independent_segments+temp_file',
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
  if (sessions.size >= MAX_SESSIONS) throw new Error('Hay conversiones VOD en curso. Intenta nuevamente.');

  const transcodeVideo = await detectVideoTranscode(url);
  const id = crypto.randomBytes(24).toString('hex');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teamg-vod-'));
  let child;
  try {
    child = spawn(bin(), ffmpegArgs(url, dir, { transcodeVideo }), { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new Error('No se pudo iniciar el conversor de video');
  }

  const session = { id, owner, dir, child, created: Date.now(), touched: Date.now(), failed: false, error: '', transcodeVideo };
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

  const waitStarted = Date.now();
  const deadline = waitStarted + READY_TIMEOUT_MS;
  try {
    while (Date.now() < deadline && !session.failed) {
      try {
        const manifest = await fs.promises.readFile(path.join(dir, 'index.m3u8'), 'utf8');
        const segments = manifest.match(/^segment-\d+\.ts$/gm) || [];
        const hasEndlist = manifest.includes('#EXT-X-ENDLIST');
        if (manifest.includes('#EXTINF:') && segments.length >= 1) {
          const firstReady = await fs.promises.stat(path.join(dir, segments[0])).catch(() => null);
          const secondReady = segments.length >= 2 ? await fs.promises.stat(path.join(dir, segments[1])).catch(() => null) : null;
          if (firstReady && (secondReady || hasEndlist || (Date.now() - waitStarted >= 8000))) {
            return { sessionId: id, url: '/api/ott/vod-hls/' + id + '/index.m3u8', transcodedVideo: transcodeVideo };
          }
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 180));
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
    if (match[2] === 'index.m3u8') {
      let manifest = await fs.promises.readFile(file, 'utf8');
      if (manifest.includes('#EXT-X-ENDLIST')) {
        manifest = manifest.replace('#EXT-X-PLAYLIST-TYPE:EVENT', '#EXT-X-PLAYLIST-TYPE:VOD');
      }
      const body = Buffer.from(manifest, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, no-store', 'Content-Length': String(body.length)
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(body);
    }
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': 'video/mp2t',
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

module.exports = { prepare, stop, serve, ffmpegArgs, detectVideoTranscode };
