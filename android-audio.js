'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const sessions = new Map(), codecs = new Map(), probes = new Map();
const MAX_SESSIONS = Math.max(1, Math.min(4, Number(process.env.ANDROID_AUDIO_MAX_SESSIONS) || 2));
const IDLE_MS = 45000, MAX_AGE_MS = 30 * 60 * 1000;
let runtimeReady;
const bin = () => process.env.FFMPEG_PATH || require('ffmpeg-static');
const inputArgs = url => ['-hide_banner', '-nostdin', '-loglevel', 'info', '-rw_timeout', '8000000',
  '-protocol_whitelist', 'http,https,tcp,tls,crypto', '-analyzeduration', '2000000', '-probesize', '2000000', '-i', url];
function validUrl(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Formato de señal no permitido');
}
function probe(url) {
  validUrl(url);
  const previous = codecs.get(url);
  if (previous && Date.now() - previous.ts < 10 * 60 * 1000) return Promise.resolve(previous.codec);
  if (probes.has(url)) return probes.get(url);
  if (probes.size >= 2) return Promise.reject(new Error('Comprobación de audio ocupada. Intenta nuevamente.'));
  const pending = new Promise((resolve, reject) => {
    let stderr = '', timedOut = false;
    const child = spawn(bin(), inputArgs(url).concat(['-map', '0:a:0', '-c:a', 'copy', '-t', '0', '-f', 'null', '-']), { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 8000);
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-32768); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Motor de conversión de audio no disponible')); });
    child.on('close', () => {
      clearTimeout(timer);
      const match = stderr.match(/Audio:\s*([a-z0-9_]+)/i);
      if (!match) return reject(new Error(timedOut ? 'La fuente no respondió al comprobar el audio' : 'No se pudo identificar el audio de la señal'));
      const codec = match[1].toLowerCase();
      if (codecs.size >= 256) codecs.delete(codecs.keys().next().value);
      codecs.set(url, { codec, ts: Date.now() }); resolve(codec);
    });
  }).finally(() => probes.delete(url));
  probes.set(url, pending);
  return pending;
}
function relayTransport(url, child, onError) {
  let request, response, closed = false;
  function close() {
    closed = true;
    if (response) response.destroy();
    if (request) request.destroy();
  }
  function fail(message) { if (!closed) { close(); onError(new Error(message)); } }
  function connect(target, redirects) {
    if (closed) return;
    const mod = new URL(target).protocol === 'https:' ? require('https') : require('http');
    request = mod.get(target, {headers:{'User-Agent':'Mozilla/5.0 (SmartTV; NetCast) AppleWebKit/534.34',Accept:'*/*'}}, res => {
      response = res;
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, target).toString();
        try { validUrl(next); } catch { res.destroy(); return fail('Redirección de señal no permitida'); }
        res.resume(); connect(next, redirects - 1); return;
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) { res.destroy(); return fail('La fuente rechazó la conexión HTTP (' + res.statusCode + ')'); }
      res.on('error', () => fail('Se interrumpió la conexión con la fuente'));
      res.pipe(child.stdin);
    });
    request.setTimeout(12000, () => fail('La fuente no respondió al recibir la señal'));
    request.on('error', () => fail('No se pudo conectar con la fuente de la señal'));
  }
  child.stdin.on('error', () => {}); // Decoder exit can close the input before the HTTP socket.
  connect(url, 5);
  return { close };
}
async function dispose(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (session.input) session.input.close();
  if (session.child.exitCode === null) session.child.kill('SIGKILL');
  await fs.promises.rm(session.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
}
async function prepare(owner, url, forceHls = false) {
  validUrl(url);
  // Raw TS already requires packaging; FFmpeg discovers and converts its audio
  // in the same connection. A separate probe must not block live startup.
  const codec = forceHls ? 'auto' : await probe(url);
  const convertAudio = forceHls || ['mp2', 'aac_latm', 'ac3', 'eac3'].includes(codec);
  const relay = forceHls && !/(?:\.m3u8|\/playlist|\/chunks)/i.test(url);
  if (!convertAudio && !forceHls) return { transcoded: false, codec };
  for (const session of sessions.values()) if (session.owner === owner) await dispose(session.id);
  if (sessions.size >= MAX_SESSIONS) throw new Error('Conversión de audio ocupada. Intenta nuevamente.');
  const id = crypto.randomBytes(24).toString('hex');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamg-audio-'));
  const args = relay ? ['-hide_banner', '-nostdin', '-loglevel', 'info', '-analyzeduration', '6000000', '-probesize', '6000000', '-i', 'pipe:0'] : inputArgs(url);
  const child = spawn(bin(), args.concat(['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy',
    ...(convertAudio ? ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-ac', '2', '-ar', '48000'] : ['-c:a', 'copy']),
    '-max_muxing_queue_size', '1024', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '5',
    '-hls_flags', 'delete_segments+omit_endlist', '-hls_delete_threshold', '2',
    '-hls_segment_filename', path.join(dir, 'segment-%06d.ts'), path.join(dir, 'index.m3u8')]),
  { windowsHide: true, stdio: [relay ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let stderrTail = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-2400); });
  const session = { id, owner, url, dir, child, touched: Date.now(), created: Date.now(), failed: false };
  sessions.set(id, session);
  if (relay) session.input = relayTransport(url, child, error => {
    session.error = error.message; session.failed = true; dispose(id);
  });
  child.on('error', err => { session.error = 'FFmpeg no pudo iniciar: ' + err.message; session.failed = true; dispose(id); });
  child.on('close', (code, signal) => {
    if (!session.error) {
      const details = stderrTail.split('\n').map(line => line.trim())
        .filter(line => /error|failed|invalid|not found|impossible|could not|unable|permission/i.test(line))
        .slice(-4).join(' | ').replace(/https?:\/\/[^\s]+/g, '[fuente]').slice(-700);
      session.error = 'FFmpeg cerró (código ' + code + (signal ? ', señal ' + signal : '') + ')' + (details ? ': ' + details : '');
    }
    session.failed = true; dispose(id);
  });
  session.ready = (async () => {
    const deadline = Date.now() + 16000;
    while (Date.now() < deadline && !session.failed) {
      try {
        const manifest = await fs.promises.readFile(path.join(dir, 'index.m3u8'), 'utf8');
        if (manifest.includes('#EXTINF:')) return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await dispose(id);
    throw new Error(session.error || ('No se creó HLS en 16 segundos. ' + (stderrTail.split('\n').slice(-5).join(' | ').replace(/https?:\/\/[^\s]+/g, '[fuente]').slice(-700) || 'FFmpeg no informó un error detallado')));
  })();
  await session.ready;
  return { transcoded: true, codec, sessionId: id, url: '/api/ott/android-audio/' + id + '/index.m3u8' };
}
function stop(owner, id) {
  if (sessions.get(id)?.owner === owner) return dispose(id);
}
async function serve(req, res, pathname) {
  if (pathname === '/api/ott/android-audio/status') {
    if (runtimeReady == null) {
      runtimeReady = false;
      try { runtimeReady = require('node:child_process').spawnSync(bin(), ['-version'], { windowsHide: true, timeout: 3000, stdio: 'ignore' }).status === 0; } catch {}
    }
    res.writeHead(runtimeReady ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: runtimeReady, rawTsMode: 'http-relay-aac' })); return;
  }
  const match = pathname.match(/^\/api\/ott\/android-audio\/([a-f0-9]{48})\/(index\.m3u8|segment-\d{6,}\.ts)$/);
  const session = match && sessions.get(match[1]);
  if (!session || session.failed || Date.now() - session.created > MAX_AGE_MS) { res.writeHead(404); res.end(); return; }
  session.touched = Date.now();
  try {
    const data = await fs.promises.readFile(path.join(session.dir, match[2]));
    res.writeHead(200, { 'Content-Type': match[2].endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      'Cache-Control': 'private, no-store', 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end(); }
}
const reaper = setInterval(() => {
  for (const session of sessions.values()) {
    if (Date.now() - session.touched > IDLE_MS || Date.now() - session.created > MAX_AGE_MS) dispose(session.id);
    else fs.promises.readdir(session.dir).then(files => Promise.all(files.map(name => fs.promises.stat(path.join(session.dir, name)).catch(() => ({ size: 0 }))))).then(stats => {
      if (stats.reduce((sum, stat) => sum + stat.size, 0) > 96 * 1024 * 1024) dispose(session.id);
    }).catch(() => {});
  }
}, 5000);
reaper.unref();
module.exports = { prepare, stop, serve, probe };
