// ============================================================================
// TeamG Play - Deezer Studio Audio Extractor
// Entrega pistas oficiales de estudio (MP3 128 kbps) directamente desde el CDN de Deezer
// Cifrado/Descifrado: Blowfish CBC (egoroof-blowfish) en memoria sin dependencias nativas
// Compatible con LG NetCast, webOS, Samsung Tizen y PC.
// ============================================================================

const deezer = require('d-fi-core');
const crypto = require('crypto');
const { Blowfish } = require('egoroof-blowfish');

const DEFAULT_DEEZER_ARL = '28b08e9c67847c84099027e79a512a9ef41e85f6c6c1ad13a9b9652f749b9744245458071f8e00b692f1af18a1a4c4a0ed8967b205030fc8460ea962ea1ffb3fec11df34bcc0f00418385a1440c3f8a909d9169599c88d176764c3e3829dcddc';

let _initialized = false;
let _initPromise = null;
let _currentArl = null;

function getDeezerArl() {
  return String(process.env.DEEZER_ARL || DEFAULT_DEEZER_ARL).trim();
}

async function ensureDeezerInit() {
  const arl = getDeezerArl();
  if (!arl) return false;
  if (_initialized && _currentArl === arl) return true;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      await deezer.initDeezerApi(arl);
      _initialized = true;
      _currentArl = arl;
      return true;
    } catch (e) {
      console.warn('[Deezer] Initialization error:', e.message);
      _initialized = false;
      return false;
    } finally {
      _initPromise = null;
    }
  })();

  return _initPromise;
}

function md5(data) {
  return crypto.createHash('md5').update(data.toString(), 'ascii').digest('hex');
}

function getBlowfishKey(trackId) {
  const SECRET = 'g4el58wc0zvf9na1';
  const idMd5 = md5(trackId);
  const keyBytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    keyBytes[i] = idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i);
  }
  return keyBytes;
}

function decryptDeezerBuffer(source, trackId) {
  const blowFishKey = getBlowfishKey(trackId);
  const bf = new Blowfish(blowFishKey, Blowfish.MODE.CBC, Blowfish.PADDING.NULL);
  bf.setIv(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));

  const destBuffer = Buffer.alloc(source.length);
  let position = 0;
  let chunk_size = 2048;
  let i = 0;

  while (position < source.length) {
    const size = source.length - position;
    chunk_size = size >= 2048 ? 2048 : size;
    const chunk = source.subarray(position, position + chunk_size);

    if (i % 3 > 0 || chunk_size < 2048) {
      chunk.copy(destBuffer, position);
    } else {
      const dec = bf.decode(chunk, Blowfish.TYPE.UINT8_ARRAY);
      Buffer.from(dec).copy(destBuffer, position);
    }
    position += chunk_size;
    i++;
  }
  return destBuffer;
}

function normalizeStr(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca y extrae el audio oficial de estudio de Deezer en memoria
 * @param {string} artist
 * @param {string} title
 * @returns {Promise<{ buffer: Buffer, mimeType: string, durationSec: number, trackId: string, title: string, artist: string } | null>}
 */
async function resolveViaDeezerBuffer(artist, title) {
  const cleanA = String(artist || '').trim();
  const cleanT = String(title || '').trim();
  if (!cleanA && !cleanT) return null;

  const ok = await ensureDeezerInit();
  if (!ok) return null;

  try {
    // 1. Buscar en la API pública de Deezer (sin rate limits ni captchas)
    const q = [cleanA, cleanT].filter(Boolean).join(' ');
    const searchUrl = 'https://api.deezer.com/search?q=' + encodeURIComponent(q) + '&limit=10';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const searchRes = await fetch(searchUrl, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    clearTimeout(timer);
    if (!searchRes.ok) return null;

    const searchJson = await searchRes.json();
    const candidates = searchJson.data || [];
    if (candidates.length === 0) return null;

    // 2. Encontrar el mejor match por título y artista
    const normT = normalizeStr(cleanT);
    const normA = normalizeStr(cleanA);
    let best = candidates[0];

    for (const c of candidates) {
      const cTitle = normalizeStr(c.title || '');
      const cArtist = normalizeStr(c.artist?.name || '');
      if (normT && cTitle.includes(normT)) {
        if (!normA || cArtist.includes(normA) || normA.includes(cArtist)) {
          best = c;
          break;
        }
      }
    }

    if (!best || !best.id) return null;

    // 3. Obtener metadatos y URL de stream desde gw-light
    const trackInfo = await deezer.getTrackInfo(best.id);
    if (!trackInfo) return null;

    // Calidad 1 = MP3 128kbps (permitida en cuentas gratuitas)
    const downloadData = await deezer.getTrackDownloadUrl(trackInfo, 1);
    if (!downloadData || !downloadData.trackUrl) return null;

    // 4. Descargar el archivo de audio desde el CDN de Deezer
    const audioCtl = new AbortController();
    const audioTimer = setTimeout(() => audioCtl.abort(), 6000);
    const audioRes = await fetch(downloadData.trackUrl, {
      signal: audioCtl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(audioTimer);
    if (!audioRes.ok) return null;

    const rawBuffer = Buffer.from(await audioRes.arrayBuffer());
    if (!rawBuffer || rawBuffer.length < 50000) return null;

    // 5. Descifrar con Blowfish si viene cifrado
    const finalBuffer = downloadData.isEncrypted
      ? decryptDeezerBuffer(rawBuffer, String(best.id))
      : rawBuffer;

    return {
      buffer: finalBuffer,
      mimeType: 'audio/mpeg',
      durationSec: best.duration || 0,
      trackId: String(best.id),
      title: best.title || cleanT,
      artist: best.artist?.name || cleanA
    };
  } catch (err) {
    console.warn('[Deezer] Failed to resolve track:', cleanA, cleanT, err.message);
    return null;
  }
}

module.exports = {
  resolveViaDeezerBuffer,
  getDeezerArl,
  ensureDeezerInit
};
