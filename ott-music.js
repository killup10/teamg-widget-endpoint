// ============================================================================
// TeamG Music para OTT TV (LG NetCast / webOS / Samsung Tizen / Android TV)
// - Catálogo musical curado + Top Global Apple Music / iTunes en tiempo real
// - 10 emisoras de radio en vivo 24/7
// - Buscador en tiempo real de canciones y artistas (iTunes + YouTube)
// - Extractor de canciones completas (YouTube ANDROID player -> Piped -> Invidious -> iTunes M4A fallback)
// - Proxy de audio con soporte HTTP Range para Smart TVs (compatible con HTTP/HTTPS)
// Sin dependencias externas.
// ============================================================================

const http = require('http');
const https = require('https');

const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Instancias públicas de respaldo para extracción de audio
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
  'https://api.piped.yt'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.JingyiL.com',
  'https://yt.artemislena.eu'
];

// ── 10 Emisoras de Radio en Vivo 24/7 verificadas (de TeamG Play) ───────────
const LIVE_RADIOS = [
  {
    id: 'la-zona',
    title: 'Radio La Zona 90.5 FM',
    artist: 'Reggaetón y Urbano · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://mdstrm.com/audio/5fada553978fe1080e3ac5ea/icecast.audio',
    mime: 'audio/mpeg'
  },
  {
    id: 'studio-92',
    title: 'Studio 92 · 92.5 FM',
    artist: 'Pop & Hits en Inglés · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://mdstrm.com/audio/5fada54116646e098d97e6a5/icecast.audio',
    mime: 'audio/mpeg'
  },
  {
    id: 'panamericana',
    title: 'Radio Panamericana 101.1 FM',
    artist: 'Salsa y Tropical · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://mdstrm.com/audio/6598b65ab398c90871aff8cc/icecast.audio',
    mime: 'audio/mpeg'
  },
  {
    id: 'oxigeno',
    title: 'Radio Oxígeno 102.1 FM',
    artist: 'Rock & Pop Clásico · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://mdstrm.com/audio/5fab0687bcd6c2389ee9480c/icecast.audio',
    mime: 'audio/mpeg'
  },
  {
    id: 'onda-cero',
    title: 'Radio Onda Cero',
    artist: 'Urbano y Juvenil · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://mdstrm.com/audio/6598b62dd1b18c0886be2f79/icecast.audio',
    mime: 'audio/mpeg'
  },
  {
    id: 'los-40',
    title: 'Los 40 Principales',
    artist: 'Éxitos Latinos · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://25593.live.streamtheworld.com/LOS40.mp3',
    mime: 'audio/mpeg'
  },
  {
    id: 'disney',
    title: 'Radio Disney',
    artist: 'Pop Familiar · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://26593.live.streamtheworld.com/DISNEY_PER_LMAAAC.aac',
    mime: 'audio/aac'
  },
  {
    id: 'ibiza-global',
    title: 'Ibiza Global Radio',
    artist: 'Electronic & House · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://listenssl.ibizaglobalradio.com:8024/ibizaglobalradio.mp3',
    mime: 'audio/mpeg'
  },
  {
    id: 'lofi-girl',
    title: 'Chillhop Beats Radio',
    artist: 'Lo-Fi & Relax 24/7 · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://streams.fluxfm.de/Chillhop/mp3-320/streams.fluxfm.de/',
    mime: 'audio/mpeg'
  },
  {
    id: 'rpp',
    title: 'RPP Noticias',
    artist: 'Noticias y Actualidad · En Vivo',
    group: '📻 Radios en Vivo 24/7',
    cover: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600&auto=format&fit=crop&q=80',
    streamUrl: 'https://mdstrm.com/audio/5fab3416b5f9ef165cfab6e9/icecast.audio',
    mime: 'audio/mpeg'
  }
];

// ── Catálogo Base Curado de Respuesta Instantánea (0ms latencia en TV) ───────
const CURATED_TRACKS = [
  // Más Escuchado (Top Global)
  { artist: 'Karol G', title: 'Si Antes Te Hubiera Conocido', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny', title: 'MONACO', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Feid & Atl Jacob', title: 'LUNA', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Lady Gaga & Bruno Mars', title: 'Die With A Smile', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'FloyyMenor & Cris MJ', title: 'Gata Only', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Myke Towers', title: 'LALA', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },
  { artist: 'The Weeknd', title: 'Blinding Lights', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Rauw Alejandro', title: 'Todo De Ti', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Shakira & Bizarrap', title: 'Bzrp Music Sessions, Vol. 53', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Quevedo & Bizarrap', title: 'Bzrp Music Sessions, Vol. 52', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Dua Lipa', title: 'Levitating', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Miley Cyrus', title: 'Flowers', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },

  // Reggaetón & Urbano
  { artist: 'Bad Bunny', title: 'Tití Me Preguntó', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny & Chencho Corleone', title: 'Me Porto Bonito', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Karol G & Shakira', title: 'TQG', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Feid', title: 'Feliz Cumpleaños Ferxxo', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Daddy Yankee', title: 'Gasolina', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Don Omar', title: 'Danza Kuduro', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Wisin & Yandel', title: 'Rakata', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'J Balvin & Willy William', title: 'Mi Gente', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Maluma', title: 'Hawái', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Rauw Alejandro & Baby Rasta', title: 'Punto 40', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Ozuna', title: 'Se Preparó', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Nicky Jam & Enrique Iglesias', title: 'El Perdón', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },

  // Salsa, Cumbia & Tropical
  { artist: 'Grupo 5', title: 'Motor y Motivo', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Grupo 5', title: 'El Ritmo de Mi Corazón', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Agua Marina', title: 'Tu Amor Fue Una Mentira', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Armonía 10', title: 'El Cervecero', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Corazón Serrano', title: 'Díganle', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Marc Anthony', title: 'Vivir Mi Vida', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Marc Anthony', title: 'Flor Pálida', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Héctor Lavoe', title: 'El Cantante', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Willie Colón', title: 'Idilio', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Romeo Santos', title: 'Propuesta Indecente', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Aventura', title: 'Obsesión', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Grupo Niche', title: 'Cali Pachanguero', group: '🎺 Salsa, Cumbia & Tropical', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },

  // Pop Latino & Baladas
  { artist: 'Luis Miguel', title: 'Ahora Te Puedes Marchar', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Shakira', title: 'Hips Don\'t Lie', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Juanes', title: 'A Dios Le Pido', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Morat', title: 'Cómo Te Atreves', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Sebastián Yatra', title: 'Tacones Rojos', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Camilo', title: 'Vida de Rico', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Chayanne', title: 'Torero', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Reik', title: 'Noviembre Sin Ti', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Gian Marco', title: 'Se Me Olvidó', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Pedro Suárez-Vértiz', title: 'Cuando Pienses En Volver', group: '🎤 Pop Latino & Baladas', cover: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80' },

  // Rock Clásico & Español
  { artist: 'Soda Stereo', title: 'De Música Ligera', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Soda Stereo', title: 'Persiana Americana', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Enanitos Verdes', title: 'Lamento Boliviano', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Hombres G', title: 'Devuélveme a mi chica', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Queen', title: 'Bohemian Rhapsody', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Guns N\' Roses', title: 'Sweet Child O\' Mine', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80' },
  { artist: 'AC/DC', title: 'Back In Black', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Libido', title: 'En Esta Habitación', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Arena Hash', title: 'Y Es Que Sucede Así', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Coldplay', title: 'Viva La Vida', group: '🎸 Rock Clásico & Español', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },

  // Electrónica & Fiesta
  { artist: 'David Guetta & Bebe Rexha', title: 'I\'m Good (Blue)', group: '⚡ Electrónica & Fiesta', cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Avicii', title: 'Wake Me Up', group: '⚡ Electrónica & Fiesta', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Calvin Harris', title: 'Summer', group: '⚡ Electrónica & Fiesta', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Tiësto', title: 'The Business', group: '⚡ Electrónica & Fiesta', cover: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Daft Punk', title: 'One More Time', group: '⚡ Electrónica & Fiesta', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Alan Walker', title: 'Faded', group: '⚡ Electrónica & Fiesta', cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80' }
];

// ── Cachés en memoria ────────────────────────────────────────────────────────
const resolveCache = new Map(); // key: "artist|title" -> { youtubeId, ts }
const RESOLVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const audioUrlCache = new Map(); // key: youtubeId -> { url, mimeType, contentLength, ts }
const AUDIO_URL_TTL_MS = 20 * 60 * 1000; // 20 min (googlevideo expira en ~6h)

let dynamicTopTracks = [];
let lastCatalogRefresh = 0;
let catalogRefreshPromise = null;
const CATALOG_TTL_MS = 30 * 60 * 1000; // 30 min

function upsizeArtwork(url) {
  if (!url) return '';
  return String(url).replace(/\/\d+x\d+bb\./, '/600x600bb.');
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 5000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctl.signal,
      headers: {
        'User-Agent': UA_BROWSER,
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Búsqueda iTunes API y Apple Music Top Charts ─────────────────────────────
async function searchItunesTracks(term, limit = 25, country = 'PE') {
  try {
    const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(term) +
      '&media=music&entity=song&limit=' + limit + '&country=' + country;
    const data = await fetchJsonWithTimeout(url, {}, 5000);
    const results = Array.isArray(data && data.results) ? data.results : [];
    return results.map((r) => ({
      artist: String(r.artistName || 'Artista').trim(),
      title: String(r.trackName || 'Canción').trim(),
      album: String(r.collectionName || '').trim(),
      cover: upsizeArtwork(r.artworkUrl100),
      previewUrl: String(r.previewUrl || '').trim(),
      durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0
    })).filter((t) => t.title && t.artist);
  } catch (e) {
    return [];
  }
}

async function fetchAppleTopSongs(country = 'pe', limit = 25) {
  try {
    const url = 'https://rss.applemarketingtools.com/api/v2/' + country + '/music/most-played/' + limit + '/songs.json';
    const data = await fetchJsonWithTimeout(url, {}, 3500);
    const results = (data && data.feed && Array.isArray(data.feed.results)) ? data.feed.results : [];
    return results.map((r) => ({
      artist: String(r.artistName || 'Artista').trim(),
      title: String(r.name || 'Canción').trim(),
      cover: upsizeArtwork(r.artworkUrl100),
      group: '🔥 Más Escuchado',
      previewUrl: ''
    })).filter((t) => t.title && t.artist);
  } catch (e) {
    return [];
  }
}

async function refreshDynamicCatalog() {
  if (catalogRefreshPromise) return catalogRefreshPromise;
  catalogRefreshPromise = (async () => {
    try {
      const [pe, mx, us] = await Promise.all([
        fetchAppleTopSongs('pe', 20),
        fetchAppleTopSongs('mx', 15),
        fetchAppleTopSongs('us', 15)
      ]);
      const combined = [...pe, ...mx, ...us];
      const seen = new Set();
      const deduped = [];
      for (const item of combined) {
        const key = (item.artist + '|' + item.title).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (deduped.length >= 36) break;
      }
      if (deduped.length > 0) {
        dynamicTopTracks = deduped;
        lastCatalogRefresh = Date.now();
      }
    } catch (e) {
      // Silencioso: se usa CURATED_TRACKS de respaldo
    } finally {
      catalogRefreshPromise = null;
    }
  })();
  return catalogRefreshPromise;
}

// ── Generador de Playlist M3U para TeamG Music ──────────────────────────────
function sanitizeM3uField(str) {
  return String(str || '').replace(/[\r\n"]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildTrackStreamUrl(baseUrl, track) {
  const params = new URLSearchParams();
  params.set('artist', track.artist || '');
  params.set('title', track.title || '');
  if (track.youtubeId) params.set('v', track.youtubeId);
  if (track.previewUrl) params.set('preview', track.previewUrl);
  return baseUrl + '/api/ott/music/stream.mp4?' + params.toString();
}

function buildRadioStreamUrl(baseUrl, radio) {
  const ext = (radio.mime === 'audio/aac') ? '.aac' : '.mp3';
  return baseUrl + '/api/ott/music/radio' + ext + '?id=' + encodeURIComponent(radio.id);
}

async function buildMusicM3u(baseUrl, searchQuery = '', forceFresh = false) {
  const q = String(searchQuery || '').trim();
  const lines = ['#EXTM3U'];

  // Si hay búsqueda activa (?q=...), buscar en iTunes en tiempo real + filtrar radios y catálogo
  if (q.length > 0) {
    const qLower = q.toLowerCase();
    const [peResults, usResults] = await Promise.all([
      searchItunesTracks(q, 30, 'PE'),
      searchItunesTracks(q, 15, 'US')
    ]);
    const seen = new Set();
    const merged = [];

    for (const r of [...peResults, ...usResults]) {
      const key = (r.artist + '|' + r.title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        artist: r.artist,
        title: r.title,
        cover: r.cover,
        previewUrl: r.previewUrl,
        group: '🔍 Resultados de Búsqueda'
      });
      if (merged.length >= 36) break;
    }

    // Incluir también radios o pistas curadas que coincidan con la búsqueda
    for (const radio of LIVE_RADIOS) {
      if (radio.title.toLowerCase().indexOf(qLower) !== -1 || radio.artist.toLowerCase().indexOf(qLower) !== -1) {
        const displayName = sanitizeM3uField('📻 ' + radio.title + ' — ' + radio.artist);
        const logo = sanitizeM3uField(radio.cover);
        lines.push('#EXTINF:-1 tvg-logo="' + logo + '" group-title="📻 Radios en Vivo 24/7",' + displayName);
        lines.push(buildRadioStreamUrl(baseUrl, radio));
      }
    }

    for (const track of merged) {
      const displayName = sanitizeM3uField(track.title + ' — ' + track.artist);
      const logo = sanitizeM3uField(track.cover);
      const grp = sanitizeM3uField(track.group || '🔍 Resultados de Búsqueda');
      lines.push('#EXTINF:-1 tvg-logo="' + logo + '" group-title="' + grp + '",' + displayName);
      lines.push(buildTrackStreamUrl(baseUrl, track));
    }

    // Si iTunes no devolvió resultados (o sin internet), permitir reproducir la búsqueda directa en YouTube
    if (merged.length === 0) {
      for (const cur of CURATED_TRACKS) {
        if (cur.title.toLowerCase().indexOf(qLower) !== -1 || cur.artist.toLowerCase().indexOf(qLower) !== -1) {
          const displayName = sanitizeM3uField(cur.title + ' — ' + cur.artist);
          const logo = sanitizeM3uField(cur.cover);
          lines.push('#EXTINF:-1 tvg-logo="' + logo + '" group-title="' + sanitizeM3uField(cur.group) + '",' + displayName);
          lines.push(buildTrackStreamUrl(baseUrl, cur));
        }
      }
      lines.push('#EXTINF:-1 tvg-logo="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80" group-title="🔍 Resultados de Búsqueda",' + sanitizeM3uField(q + ' — Búsqueda Directa'));
      lines.push(buildTrackStreamUrl(baseUrl, { artist: '', title: q }));
    }

    return lines.join('\n') + '\n';
  }

  // Catálogo principal: disparar actualización de Top Global sin bloquear más de 1.8s
  if (forceFresh || Date.now() - lastCatalogRefresh > CATALOG_TTL_MS || dynamicTopTracks.length === 0) {
    try {
      await Promise.race([
        refreshDynamicCatalog(),
        new Promise((resolve) => setTimeout(resolve, 1800))
      ]);
    } catch (e) {}
  }

  // 1. 🔥 Más Escuchado (Top Global dinámico + éxitos curados sin duplicar)
  const seenTop = new Set();
  const topList = [...dynamicTopTracks, ...CURATED_TRACKS.filter((t) => t.group === '🔥 Más Escuchado')];
  for (const track of topList) {
    const key = (track.artist + '|' + track.title).toLowerCase();
    if (seenTop.has(key)) continue;
    seenTop.add(key);
    const displayName = sanitizeM3uField(track.title + ' — ' + track.artist);
    const logo = sanitizeM3uField(track.cover);
    lines.push('#EXTINF:-1 tvg-logo="' + logo + '" group-title="🔥 Más Escuchado",' + displayName);
    lines.push(buildTrackStreamUrl(baseUrl, track));
  }

  // 2. 📻 Radios en Vivo 24/7
  for (const radio of LIVE_RADIOS) {
    const displayName = sanitizeM3uField('📻 ' + radio.title + ' (' + radio.artist + ')');
    const logo = sanitizeM3uField(radio.cover);
    lines.push('#EXTINF:-1 tvg-logo="' + logo + '" group-title="' + sanitizeM3uField(radio.group) + '",' + displayName);
    lines.push(buildRadioStreamUrl(baseUrl, radio));
  }

  // 3. Géneros y Playlists Curadas
  for (const track of CURATED_TRACKS) {
    if (track.group === '🔥 Más Escuchado') continue;
    const displayName = sanitizeM3uField(track.title + ' — ' + track.artist);
    const logo = sanitizeM3uField(track.cover);
    const grp = sanitizeM3uField(track.group);
    lines.push('#EXTINF:-1 tvg-logo="' + logo + '" group-title="' + grp + '",' + displayName);
    lines.push(buildTrackStreamUrl(baseUrl, track));
  }

  return lines.join('\n') + '\n';
}

// ── Resolución de YouTube ID (Canciones completas) ──────────────────────────
function parseDurationSeconds(text) {
  if (!text || typeof text !== 'string') return 0;
  const parts = text.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

async function searchViaYouTubeHtml(query) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6500);
  try {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query) + '&hl=en&gl=US';
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': UA_BROWSER,
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+417'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{.+?\});<\/script>/s) ||
                  html.match(/ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
    if (!match) {
      const simple = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      return simple ? simple[1] : null;
    }
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    let firstValidId = null;

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item.videoRenderer;
        if (!vr || !vr.videoId) continue;
        const isLive = (vr.badges || []).some((b) =>
          (b?.metadataBadgeRenderer?.style || '').includes('LIVE') ||
          (b?.metadataBadgeRenderer?.label || '').toLowerCase().includes('live')
        );
        if (isLive) continue;
        const navUrl = vr.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
        if (navUrl.includes('/shorts/')) continue;

        const durText = vr.lengthText?.simpleText || '';
        const durSec = parseDurationSeconds(durText);
        if (!firstValidId) firstValidId = vr.videoId;
        if (durSec >= 60 && durSec <= 660) {
          return vr.videoId;
        }
      }
    }
    return firstValidId;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchViaPiped(query) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const data = await fetchJsonWithTimeout(
        instance + '/search?q=' + encodeURIComponent(query) + '&filter=music_songs',
        {},
        4500
      );
      const items = Array.isArray(data && data.items) ? data.items : [];
      const hit = items.find((i) => i.url && i.url.includes('watch?v=') && (i.duration > 60 || !i.duration));
      if (hit) {
        const m = hit.url.match(/v=([a-zA-Z0-9_-]{11})/);
        if (m) return m[1];
      }
    } catch (e) {}
  }
  return null;
}

async function searchViaInvidious(query) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const items = await fetchJsonWithTimeout(
        instance + '/api/v1/search?q=' + encodeURIComponent(query) + '&type=video',
        {},
        4500
      );
      if (!Array.isArray(items)) continue;
      const hit = items.find((i) => i.videoId && !i.liveNow && (i.lengthSeconds > 60 || !i.lengthSeconds));
      if (hit) return hit.videoId;
    } catch (e) {}
  }
  return null;
}

async function resolveYouTubeId(artist, title) {
  const key = (String(artist || '').trim() + '|' + String(title || '').trim()).toLowerCase();
  if (resolveCache.has(key)) {
    const entry = resolveCache.get(key);
    if (Date.now() - entry.ts < RESOLVE_TTL_MS) return entry.youtubeId;
  }
  const q = [artist, title, 'official audio'].filter(Boolean).join(' - ').trim();
  if (!q) return null;

  const videoId = (await searchViaYouTubeHtml(q)) ||
                  (await searchViaPiped(q)) ||
                  (await searchViaInvidious(q));
  if (videoId) {
    resolveCache.set(key, { youtubeId: videoId, ts: Date.now() });
  }
  return videoId;
}

// ── Extracción de URL de Audio Directa (M4A AAC itag=140 preferido) ─────────
async function audioViaYouTubeI(youtubeId) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
      },
      body: JSON.stringify({
        videoId: youtubeId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US'
          }
        }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const adaptive = data?.streamingData?.adaptiveFormats || [];
    const formats = data?.streamingData?.formats || [];
    const all = [...adaptive, ...formats].filter((f) => f && f.url && f.mimeType);
    // Preferir audio/mp4 (itag 140) para compatibilidad 100% con LG NetCast / Tizen / webOS
    const m4a = all.find((f) => f.itag === 140) ||
                all.find((f) => f.mimeType.startsWith('audio/mp4')) ||
                all.find((f) => f.mimeType.startsWith('audio/')) ||
                all.find((f) => f.mimeType.startsWith('video/mp4'));
    if (!m4a) return null;
    return {
      url: m4a.url,
      mimeType: m4a.mimeType.split(';')[0] || 'audio/mp4',
      contentLength: m4a.contentLength ? Number(m4a.contentLength) : null
    };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function audioViaPiped(youtubeId) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const data = await fetchJsonWithTimeout(instance + '/streams/' + encodeURIComponent(youtubeId), {}, 5000);
      const streams = Array.isArray(data && data.audioStreams) ? data.audioStreams : [];
      if (!streams.length) continue;
      const m4a = streams.find((s) => s.url && (s.mimeType || '').includes('mp4')) ||
                  streams.find((s) => s.url);
      if (m4a && m4a.url) {
        return {
          url: m4a.url,
          mimeType: (m4a.mimeType || 'audio/mp4').split(';')[0],
          contentLength: m4a.contentLength ? Number(m4a.contentLength) : null
        };
      }
    } catch (e) {}
  }
  return null;
}

async function audioViaInvidious(youtubeId) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJsonWithTimeout(instance + '/api/v1/videos/' + encodeURIComponent(youtubeId), {}, 5000);
      const streams = Array.isArray(data && data.adaptiveFormats) ? data.adaptiveFormats : [];
      const m4a = streams.find((s) => s.url && (s.type || '').startsWith('audio/mp4')) ||
                  streams.find((s) => s.url && (s.type || '').startsWith('audio/'));
      if (m4a && m4a.url) {
        return {
          url: m4a.url,
          mimeType: (m4a.type || 'audio/mp4').split(';')[0],
          contentLength: m4a.clen ? Number(m4a.clen) : null
        };
      }
    } catch (e) {}
  }
  return null;
}

async function resolveAudioStream( { youtubeId, artist, title, previewUrl }) {
  let vid = String(youtubeId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(vid) && (artist || title)) {
    vid = (await resolveYouTubeId(artist, title)) || '';
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) {
    if (audioUrlCache.has(vid)) {
      const cached = audioUrlCache.get(vid);
      if (Date.now() - cached.ts < AUDIO_URL_TTL_MS) {
        return cached;
      }
    }
    const resolved = (await audioViaYouTubeI(vid)) ||
                     (await audioViaPiped(vid)) ||
                     (await audioViaInvidious(vid));
    if (resolved && resolved.url) {
      const entry = { ...resolved, youtubeId: vid, ts: Date.now() };
      audioUrlCache.set(vid, entry);
      return entry;
    }
  }

  // Respaldo garantizado: buscar preview M4A en iTunes si YouTube está bloqueado en la IP del servidor
  let fallbackUrl = String(previewUrl || '').trim();
  if (!fallbackUrl && (artist || title)) {
    const q = [artist, title].filter(Boolean).join(' ').trim();
    const itunes = await searchItunesTracks(q, 3, 'PE');
    if (itunes.length > 0 && itunes[0].previewUrl) {
      fallbackUrl = itunes[0].previewUrl;
    }
  }
  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) {
    return {
      url: fallbackUrl,
      mimeType: 'audio/mp4',
      contentLength: null
    };
  }

  return null;
}

// ── Proxy de Streaming de Audio y Radio para Smart TVs ──────────────────────
function proxyUpstreamAudio(targetUrl, req, res, defaultMime = 'audio/mp4', totalLength = null, redirectsLeft = 5) {
  if (redirectsLeft <= 0) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end('Too many redirects');
    }
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end('Invalid upstream URL');
    }
    return;
  }

  const mod = parsed.protocol === 'https:' ? https : http;
  const reqHeaders = {
    'User-Agent': UA_BROWSER,
    Accept: '*/*',
    Connection: 'keep-alive'
  };

  // Manejo de Range para googlevideo.com y Smart TVs
  const clientRange = req.headers && req.headers.range;
  const isGoogleVideo = parsed.hostname.includes('googlevideo.com');
  if (clientRange) {
    if (isGoogleVideo && totalLength) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(String(clientRange).trim());
      if (m) {
        const start = parseInt(m[1], 10);
        const rawEnd = m[2] ? parseInt(m[2], 10) : Math.min(start + 2 * 1024 * 1024 - 1, totalLength - 1);
        const end = Math.min(rawEnd, totalLength - 1);
        reqHeaders.Range = 'bytes=' + start + '-' + end;
      } else {
        reqHeaders.Range = clientRange;
      }
    } else {
      reqHeaders.Range = clientRange;
    }
  } else if (isGoogleVideo && totalLength) {
    reqHeaders.Range = 'bytes=0-' + (totalLength - 1);
  }

  const upReq = mod.request(targetUrl, {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: reqHeaders,
    rejectUnauthorized: false,
    timeout: 20000
  }, (upRes) => {
    if (upRes.statusCode >= 300 && upRes.statusCode < 400 && upRes.headers.location) {
      const nextUrl = new URL(upRes.headers.location, targetUrl).toString();
      upRes.resume();
      return proxyUpstreamAudio(nextUrl, req, res, defaultMime, totalLength, redirectsLeft - 1);
    }

    const outHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept, User-Agent',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Content-Type': (upRes.headers['content-type'] || defaultMime).split(';')[0],
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    };

    if (upRes.headers['content-length']) outHeaders['Content-Length'] = upRes.headers['content-length'];
    if (upRes.headers['content-range']) outHeaders['Content-Range'] = upRes.headers['content-range'];

    // Si el cliente no pidió Range pero nosotros enviamos Range completo a googlevideo, responder 200 OK a TVs NetCast
    const statusCode = (!clientRange && upRes.statusCode === 206) ? 200 : (upRes.statusCode || 200);
    if (statusCode === 200 && !clientRange) {
      delete outHeaders['Content-Range'];
    }

    res.writeHead(statusCode, outHeaders);
    if (req.method === 'HEAD') {
      upRes.resume();
      return res.end();
    }
    upRes.pipe(res);
  });

  upReq.on('timeout', () => {
    try { upReq.destroy(new Error('Upstream timeout')); } catch (e) {}
  });

  upReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end('Audio proxy error: ' + err.message);
    }
  });

  if (req && typeof req.on === 'function') {
    req.on('close', () => {
      try { upReq.destroy(); } catch (e) {}
    });
  }

  upReq.end();
}

async function handleMusicStream(req, res, pathname, query) {
  // 1. Emisora de radio en vivo (/api/ott/music/radio.mp3?id=...)
  if (pathname.indexOf('/api/ott/music/radio') === 0) {
    const id = String(query.id || '').trim();
    const radio = LIVE_RADIOS.find((r) => r.id === id) || LIVE_RADIOS[0];
    return proxyUpstreamAudio(radio.streamUrl, req, res, radio.mime || 'audio/mpeg', null);
  }

  // 2. Canción bajo demanda (/api/ott/music/stream.mp4?artist=...&title=...)
  const youtubeId = String(query.v || query.youtubeId || '').trim();
  const artist = String(query.artist || '').trim();
  const title = String(query.title || '').trim();
  const previewUrl = String(query.preview || '').trim();

  try {
    const stream = await resolveAudioStream({ youtubeId, artist, title, previewUrl });
    if (!stream || !stream.url) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, error: 'Audio no disponible para esta pista' }));
    }
    return proxyUpstreamAudio(stream.url, req, res, stream.mimeType || 'audio/mp4', stream.contentLength || null);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: err.message || 'Error al resolver audio' }));
    }
  }
}

module.exports = {
  LIVE_RADIOS,
  CURATED_TRACKS,
  buildMusicM3u,
  searchItunesTracks,
  resolveYouTubeId,
  resolveAudioStream,
  handleMusicStream
};
