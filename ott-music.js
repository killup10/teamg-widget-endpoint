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
  { artist: 'KAROL G, Judeline & rusowsky', title: 'BbY WOW', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'KAROL G', title: 'LATINA FOREVA', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Karol G', title: 'Si Antes Te Hubiera Conocido', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny', title: 'MONACO', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny', title: 'Yonaguni', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny', title: 'Efecto', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Fuerza Regida & Grupo Frontera', title: 'COQUETA', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Rauw Alejandro', title: 'Dile a El', group: '🔥 Más Escuchado', cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80' },
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
  { artist: 'KAROL G, Judeline & rusowsky', title: 'BbY WOW', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'KAROL G', title: 'AMARGURA', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Karol G & Shakira', title: 'TQG', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Karol G', title: 'Provenza', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Karol G & Peso Pluma', title: 'Qlona', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny', title: 'Tití Me Preguntó', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny & Chencho Corleone', title: 'Me Porto Bonito', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Bad Bunny & JHAYCO', title: 'DÁKITI', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Feid', title: 'Feliz Cumpleaños Ferxxo', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
  { artist: 'Feid & Young Miko', title: 'Classy 101', group: '💃 Reggaetón & Urbano', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
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
const MAX_CACHE_ENTRIES = 400; // Límite estricto de RAM para Render Free (512 MB)

// Caché acotada de buffers M4A/MP3 ensamblados (máximo 4 pistas en RAM ~12 MB) para soporte Range instantáneo
const audioBufferCache = new Map(); // key: trackKey -> { buffer, mimeType, ts }
const MAX_BUFFER_CACHE = 4;
const BUFFER_CACHE_TTL_MS = 15 * 60 * 1000;

function setBoundedBufferCache(key, value) {
  if (audioBufferCache.size >= MAX_BUFFER_CACHE && !audioBufferCache.has(key)) {
    const oldest = audioBufferCache.keys().next().value;
    if (oldest !== undefined) audioBufferCache.delete(oldest);
  }
  audioBufferCache.set(key, value);
}

// ── Extractor de Canciones Completas vía SoundCloud API v2 + Remuxer M4A Clásico ──
let cachedScClientId = '';
let cachedScClientTs = 0;
const SC_CLIENT_TTL_MS = 6 * 60 * 60 * 1000;

async function getSoundCloudClientId(forceRefresh = false) {
  if (!forceRefresh && cachedScClientId && Date.now() - cachedScClientTs < SC_CLIENT_TTL_MS) {
    return cachedScClientId;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const pageRes = await fetch('https://soundcloud.com/discover', {
      signal: ctl.signal,
      headers: { 'User-Agent': UA_BROWSER }
    });
    if (!pageRes.ok) return cachedScClientId || '';
    const html = await pageRes.text();
    const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    for (const scriptUrl of scripts.slice(-5)) {
      const jsRes = await fetch(scriptUrl, { signal: ctl.signal, headers: { 'User-Agent': UA_BROWSER } });
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
      const m = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
      if (m && m[1]) {
        cachedScClientId = m[1];
        cachedScClientTs = Date.now();
        return cachedScClientId;
      }
    }
  } catch (e) {
  } finally {
    clearTimeout(timer);
  }
  return cachedScClientId || '';
}

function findMp4Box(buf, target, start = 0, end = buf.length) {
  let off = start;
  while (off + 8 <= end) {
    const sz = buf.readUInt32BE(off);
    const tp = buf.slice(off + 4, off + 8).toString('ascii');
    if (sz < 8 || off + sz > end) break;
    if (tp === target) return { offset: off, size: sz, dataStart: off + 8, end: off + sz };
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof', 'traf'].includes(tp)) {
      const sub = findMp4Box(buf, target, off + 8, off + sz);
      if (sub) return sub;
    }
    off += sz;
  }
  return null;
}

function makeMp4Box(type, payload) {
  const b = Buffer.allocUnsafe(8 + payload.length);
  b.writeUInt32BE(b.length, 0);
  b.write(type, 4, 4, 'ascii');
  payload.copy(b, 8);
  return b;
}

function fmp4ToClassicM4a(initBuf, segBufs) {
  const sampleSizes = [];
  const mdatChunks = [];
  let totalMdatPayload = 0;

  for (const seg of segBufs) {
    const trun = findMp4Box(seg, 'trun');
    const mdat = findMp4Box(seg, 'mdat');
    if (!trun || !mdat) continue;
    const flags = seg.readUInt32BE(trun.dataStart) & 0xffffff;
    const count = seg.readUInt32BE(trun.dataStart + 4);
    let ptr = trun.dataStart + 8;
    if (flags & 0x001) ptr += 4;
    if (flags & 0x004) ptr += 4;
    for (let i = 0; i < count; i++) {
      if (flags & 0x100) ptr += 4;
      const sz = (flags & 0x200) ? seg.readUInt32BE(ptr) : 0;
      if (flags & 0x200) ptr += 4;
      if (flags & 0x400) ptr += 4;
      if (flags & 0x800) ptr += 4;
      if (sz > 0) sampleSizes.push(sz);
    }
    const raw = seg.subarray(mdat.dataStart, mdat.end);
    mdatChunks.push(raw);
    totalMdatPayload += raw.length;
  }

  const totalSamples = sampleSizes.length;
  const stsdBox = findMp4Box(initBuf, 'stsd');
  const mdhdBox = findMp4Box(initBuf, 'mdhd');
  const hdlrBox = findMp4Box(initBuf, 'hdlr');
  const smhdBox = findMp4Box(initBuf, 'smhd');
  const dinfBox = findMp4Box(initBuf, 'dinf');
  const tkhdBox = findMp4Box(initBuf, 'tkhd');
  const mvhdBox = findMp4Box(initBuf, 'mvhd');

  const mdhdVer = initBuf[mdhdBox.dataStart];
  const timescale = initBuf.readUInt32BE(mdhdBox.dataStart + (mdhdVer === 1 ? 20 : 12)) || 44100;
  const totalDuration = totalSamples * 1024;

  const mvhd = Buffer.from(initBuf.subarray(mvhdBox.offset, mvhdBox.end));
  const mvhdVer = mvhd[8];
  const mvhdScale = mvhd.readUInt32BE(8 + (mvhdVer === 1 ? 20 : 12)) || 1000;
  const mvhdDur = Math.round((totalDuration / timescale) * mvhdScale);
  if (mvhdVer === 0) mvhd.writeUInt32BE(mvhdDur, 8 + 16);

  const tkhd = Buffer.from(initBuf.subarray(tkhdBox.offset, tkhdBox.end));
  if (tkhd[8] === 0) tkhd.writeUInt32BE(mvhdDur, 8 + 20);

  const mdhd = Buffer.from(initBuf.subarray(mdhdBox.offset, mdhdBox.end));
  if (mdhd[8] === 0) mdhd.writeUInt32BE(totalDuration, 8 + 16);

  const sttsPayload = Buffer.alloc(16);
  sttsPayload.writeUInt32BE(1, 4);
  sttsPayload.writeUInt32BE(totalSamples, 8);
  sttsPayload.writeUInt32BE(1024, 12);
  const stts = makeMp4Box('stts', sttsPayload);

  const stscPayload = Buffer.alloc(20);
  stscPayload.writeUInt32BE(1, 4);
  stscPayload.writeUInt32BE(1, 8);
  stscPayload.writeUInt32BE(totalSamples, 12);
  stscPayload.writeUInt32BE(1, 16);
  const stsc = makeMp4Box('stsc', stscPayload);

  const stszPayload = Buffer.alloc(12 + totalSamples * 4);
  stszPayload.writeUInt32BE(totalSamples, 8);
  for (let i = 0; i < totalSamples; i++) {
    stszPayload.writeUInt32BE(sampleSizes[i], 12 + i * 4);
  }
  const stsz = makeMp4Box('stsz', stszPayload);

  const stcoPayload = Buffer.alloc(12);
  stcoPayload.writeUInt32BE(1, 4);
  const stco = makeMp4Box('stco', stcoPayload);

  const stsd = initBuf.subarray(stsdBox.offset, stsdBox.end);
  const stbl = makeMp4Box('stbl', Buffer.concat([stsd, stts, stsc, stsz, stco]));
  const minf = makeMp4Box('minf', Buffer.concat([
    initBuf.subarray(smhdBox.offset, smhdBox.end),
    initBuf.subarray(dinfBox.offset, dinfBox.end),
    stbl
  ]));
  const mdia = makeMp4Box('mdia', Buffer.concat([
    mdhd,
    initBuf.subarray(hdlrBox.offset, hdlrBox.end),
    minf
  ]));
  const trak = makeMp4Box('trak', Buffer.concat([tkhd, mdia]));
  const moov = makeMp4Box('moov', Buffer.concat([mvhd, trak]));

  // ftyp estándar M4A/isom/mp42 compatible con Smart TVs desde 2011 hasta hoy
  const ftypPayload = Buffer.alloc(20);
  ftypPayload.write('M4A ', 0, 4, 'ascii');
  ftypPayload.writeUInt32BE(512, 4);
  ftypPayload.write('M4A ', 8, 4, 'ascii');
  ftypPayload.write('isom', 12, 4, 'ascii');
  ftypPayload.write('mp42', 16, 4, 'ascii');
  const ftyp = makeMp4Box('ftyp', ftypPayload);

  const mdatDataOffset = ftyp.length + moov.length + 8;
  const stcoInMoov = findMp4Box(moov, 'stco');
  moov.writeUInt32BE(mdatDataOffset, stcoInMoov.dataStart + 8);

  const mdatHeader = Buffer.alloc(8);
  mdatHeader.writeUInt32BE(8 + totalMdatPayload, 0);
  mdatHeader.write('mdat', 4, 4, 'ascii');

  return Buffer.concat([ftyp, moov, mdatHeader, ...mdatChunks]);
}

async function resolveViaSoundCloudBuffer(artist, title) {
  const q = [artist, title].filter(Boolean).join(' - ').trim();
  if (!q) return null;
  let clientId = await getSoundCloudClientId(false);
  if (!clientId) return null;

  try {
    let searchUrl = 'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(q) + '&client_id=' + clientId + '&limit=20';
    let srRes = await fetch(searchUrl, { headers: { 'User-Agent': UA_BROWSER } });
    if (srRes.status === 401 || srRes.status === 403) {
      clientId = await getSoundCloudClientId(true);
      if (!clientId) return null;
      searchUrl = 'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(q) + '&client_id=' + clientId + '&limit=20';
      srRes = await fetch(searchUrl, { headers: { 'User-Agent': UA_BROWSER } });
    }
    if (!srRes.ok) return null;
    const sr = await srRes.json();

    const candidates = (sr.collection || []).filter((t) =>
      t &&
      t.duration >= 90000 &&
      t.duration <= 600000 &&
      (t.media?.transcodings || []).some((tr) => !tr.snipped && (
        tr.format?.protocol === 'progressive' ||
        (tr.format?.protocol === 'hls' && (
          tr.preset === 'aac_160k' ||
          tr.preset === 'aac_96k' ||
          tr.preset === 'mp3_1_0' ||
          (tr.format?.mime_type || '').includes('mp4') ||
          (tr.format?.mime_type || '').includes('mpeg')
        ))
      ))
    );
    if (candidates.length === 0) return null;

    const wantsRemix = /(remix|live|en vivo|cover|instrumental|karaoke)/i.test(q);
    const cleanOrig = wantsRemix
      ? candidates
      : candidates.filter((t) => !/(remix|mashup|edit|cover|karaoke|instrumental|slowed|reverb|tributo|remake|bootleg|sped|en vivo|live|circuit|dj )/i.test(t.title || ''));
    const best = cleanOrig[0] || candidates[0];

    const tr = best.media.transcodings.find((x) => !x.snipped && x.preset === 'aac_160k') ||
               best.media.transcodings.find((x) => !x.snipped && x.preset === 'aac_96k') ||
               best.media.transcodings.find((x) => !x.snipped && x.format?.protocol === 'progressive') ||
               best.media.transcodings.find((x) => !x.snipped && x.format?.protocol === 'hls' && (x.format?.mime_type || '').includes('mpeg')) ||
               best.media.transcodings.find((x) => !x.snipped);
    if (!tr || !tr.url) return null;

    const sep = tr.url.includes('?') ? '&' : '?';
    const authUrl = tr.url + sep + 'client_id=' + clientId +
      (best.track_authorization ? '&track_authorization=' + encodeURIComponent(best.track_authorization) : '');
    const mediaInfo = await fetchJsonWithTimeout(authUrl, {}, 6000);
    if (!mediaInfo || !mediaInfo.url) return null;

    if (tr.format?.protocol === 'progressive') {
      const mp3Res = await fetch(mediaInfo.url, { headers: { 'User-Agent': UA_BROWSER } });
      if (!mp3Res.ok) return null;
      const buf = Buffer.from(await mp3Res.arrayBuffer());
      return { buffer: buf, mimeType: 'audio/mpeg', durationMs: best.duration };
    }

    const m3u8Res = await fetch(mediaInfo.url, { headers: { 'User-Agent': UA_BROWSER } });
    if (!m3u8Res.ok) return null;
    const m3u8 = await m3u8Res.text();
    const initMatch = m3u8.match(/#EXT-X-MAP:URI="([^"]+)"/);
    const segUrls = m3u8.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
    if (segUrls.length === 0) return null;

    const segBufs = await Promise.all(
      segUrls.map(async (u) => Buffer.from(await (await fetch(u, { headers: { 'User-Agent': UA_BROWSER } })).arrayBuffer()))
    );

    if (initMatch && initMatch[1]) {
      const initBuf = Buffer.from(await (await fetch(initMatch[1], { headers: { 'User-Agent': UA_BROWSER } })).arrayBuffer());
      const m4aBuf = fmp4ToClassicM4a(initBuf, segBufs);
      return { buffer: m4aBuf, mimeType: 'audio/mp4', durationMs: best.duration };
    }

    return { buffer: Buffer.concat(segBufs), mimeType: 'audio/mpeg', durationMs: best.duration };
  } catch (e) {
    return null;
  }
}

function serveAudioBufferWithRange(req, res, buffer, mimeType = 'audio/mp4') {
  const total = buffer.length;
  const range = req.headers && req.headers.range;
  const baseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept, User-Agent',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=900'
  };

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.writeHead(416, { ...baseHeaders, 'Content-Range': 'bytes */' + total });
        return res.end();
      }
      const chunk = buffer.subarray(start, end + 1);
      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Content-Length': String(chunk.length)
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(chunk);
    }
  }

  res.writeHead(200, {
    ...baseHeaders,
    'Content-Length': String(total)
  });
  if (req.method === 'HEAD') return res.end();
  return res.end(buffer);
}

function setBoundedCache(map, key, value) {
  if (map.size >= MAX_CACHE_ENTRIES && !map.has(key)) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, value);
}

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
        fetchAppleTopSongs('pe', 50),
        fetchAppleTopSongs('mx', 25),
        fetchAppleTopSongs('us', 25)
      ]);
      const combined = [...pe, ...mx, ...us];
      const seen = new Set();
      const deduped = [];
      for (const item of combined) {
        const key = (item.artist + '|' + item.title).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (deduped.length >= 60) break;
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

// Pre-calentar catálogo dinámico en background al iniciar el servidor
try { refreshDynamicCatalog().catch(() => {}); } catch (eWarm) {}

// ── Generador de Playlist M3U para TeamG Music ──────────────────────────────
function sanitizeM3uField(str) {
  return String(str || '').replace(/[\r\n"]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildTrackStreamUrl(baseUrl, track) {
  const params = new URLSearchParams();
  params.set('artist', track.artist || '');
  params.set('title', track.title || '');
  if (track.youtubeId) params.set('v', track.youtubeId);
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
  const candidates = await searchYouTubeCandidatesHtml(query);
  return candidates.length > 0 ? candidates[0] : null;
}

async function searchYouTubeCandidatesHtml(query) {
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
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{.+?\});<\/script>/s) ||
                  html.match(/ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
    if (!match) {
      const simple = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      return simple ? [simple[1]] : [];
    }
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const preferred = [];
    const fallback = [];

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
        if (durSec >= 60 && durSec <= 660) {
          if (!preferred.includes(vr.videoId)) preferred.push(vr.videoId);
        } else if (durSec === 0 || durSec > 45) {
          if (!fallback.includes(vr.videoId)) fallback.push(vr.videoId);
        }
        if (preferred.length >= 4) break;
      }
      if (preferred.length >= 4) break;
    }
    return [...preferred, ...fallback].slice(0, 4);
  } catch (e) {
    return [];
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
    setBoundedCache(resolveCache, key, { youtubeId: videoId, ts: Date.now() });
  }
  return videoId;
}

// ── Extracción de URL de Audio Directa Completa (M4A AAC itag=140) ──────────
let cachedVisitorData = '';
let cachedVisitorTs = 0;
const VISITOR_TTL_MS = 30 * 60 * 1000;

async function getYouTubeVisitorData() {
  if (cachedVisitorData && Date.now() - cachedVisitorTs < VISITOR_TTL_MS) {
    return cachedVisitorData;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4500);
  try {
    const res = await fetch('https://www.youtube.com/sw.js_data', {
      signal: ctl.signal,
      headers: { 'User-Agent': UA_BROWSER }
    });
    if (res.ok) {
      const raw = await res.text();
      const parsed = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
      const vd = parsed?.[0]?.[2]?.[0]?.[0]?.[13];
      if (vd && typeof vd === 'string') {
        cachedVisitorData = vd;
        cachedVisitorTs = Date.now();
        return vd;
      }
    }
  } catch (e) {
  } finally {
    clearTimeout(timer);
  }
  return cachedVisitorData || '';
}

const YT_CLIENTS = [
  {
    clientName: 'IOS',
    clientVersion: '20.03.02',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    osName: 'iPhone',
    osVersion: '18.2.1.22C161',
    ua: 'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)'
  },
  {
    clientName: 'VISIONOS',
    clientVersion: '0.1',
    deviceMake: 'Apple',
    deviceModel: 'RealityDevice14,1',
    osName: 'visionOS',
    osVersion: '1.3.21O771',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
  }
];

async function audioViaYouTubeI(youtubeId) {
  const visitorData = await getYouTubeVisitorData();
  for (const clientCfg of YT_CLIENTS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': clientCfg.ua
      };
      if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        signal: ctl.signal,
        headers,
        body: JSON.stringify({
          videoId: youtubeId,
          context: {
            client: {
              clientName: clientCfg.clientName,
              clientVersion: clientCfg.clientVersion,
              deviceMake: clientCfg.deviceMake,
              deviceModel: clientCfg.deviceModel,
              osName: clientCfg.osName,
              osVersion: clientCfg.osVersion,
              visitorData: visitorData || undefined,
              hl: 'en',
              gl: 'US'
            }
          }
        })
      });
      if (!res.ok) continue;
      const data = await res.json();
      const adaptive = data?.streamingData?.adaptiveFormats || [];
      const formats = data?.streamingData?.formats || [];
      const all = [...adaptive, ...formats].filter((f) => f && f.url && f.mimeType);
      // Preferir audio/mp4 completo (itag 140) para compatibilidad 100% con LG NetCast / Tizen / webOS
      const m4a = all.find((f) => f.itag === 140) ||
                  all.find((f) => f.mimeType.startsWith('audio/mp4')) ||
                  all.find((f) => f.mimeType.startsWith('audio/')) ||
                  all.find((f) => f.mimeType.startsWith('video/mp4'));
      if (!m4a) continue;
      return {
        url: m4a.url,
        mimeType: m4a.mimeType.split(';')[0] || 'audio/mp4',
        contentLength: m4a.contentLength ? Number(m4a.contentLength) : null,
        durationMs: m4a.approxDurationMs ? Number(m4a.approxDurationMs) : null,
        userAgent: clientCfg.ua
      };
    } catch (e) {
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
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

async function resolveAudioStream({ youtubeId, artist, title }) {
  const candidates = [];
  const initialVid = String(youtubeId || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(initialVid)) {
    candidates.push(initialVid);
  }

  if (artist || title) {
    const key = (String(artist || '').trim() + '|' + String(title || '').trim()).toLowerCase();
    if (resolveCache.has(key)) {
      const entry = resolveCache.get(key);
      if (Date.now() - entry.ts < RESOLVE_TTL_MS && entry.youtubeId && !candidates.includes(entry.youtubeId)) {
        candidates.push(entry.youtubeId);
      }
    }
    const q = [artist, title, 'official audio'].filter(Boolean).join(' - ').trim();
    if (candidates.length === 0 && q) {
      const htmlIds = await searchYouTubeCandidatesHtml(q);
      for (const id of htmlIds) {
        if (!candidates.includes(id)) candidates.push(id);
      }
      if (candidates.length === 0) {
        const fallbackId = (await searchViaPiped(q)) || (await searchViaInvidious(q));
        if (fallbackId) candidates.push(fallbackId);
      }
      if (candidates[0]) {
        setBoundedCache(resolveCache, key, { youtubeId: candidates[0], ts: Date.now() });
      }
    }
  }

  for (const vid of candidates) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(vid)) continue;
    if (audioUrlCache.has(vid)) {
      const cached = audioUrlCache.get(vid);
      if (Date.now() - cached.ts < AUDIO_URL_TTL_MS) {
        return cached;
      }
    }
    // Canción 100% completa (nunca preview de 30s): IOS/VISIONOS YouTube player -> Piped -> Invidious
    const resolved = (await audioViaYouTubeI(vid)) ||
                     (await audioViaPiped(vid)) ||
                     (await audioViaInvidious(vid));
    if (resolved && resolved.url) {
      const entry = { ...resolved, youtubeId: vid, ts: Date.now() };
      setBoundedCache(audioUrlCache, vid, entry);
      return entry;
    }
  }

  return null;
}

// ── Proxy de Streaming de Audio y Radio para Smart TVs ──────────────────────
function proxyUpstreamAudio(targetUrl, req, res, defaultMime = 'audio/mp4', totalLength = null, redirectsLeft = 5, customUa = '') {
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
    'User-Agent': customUa || UA_BROWSER,
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
      return proxyUpstreamAudio(nextUrl, req, res, defaultMime, totalLength, redirectsLeft - 1, customUa);
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

function isLegacyNetcastReq(req) {
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  return ua.indexOf('NetCast') !== -1 && ua.indexOf('Web0S') === -1 && ua.indexOf('webOS') === -1;
}

function isIpBoundUrl(targetUrl) {
  try {
    const u = new URL(targetUrl);
    return u.hostname.indexOf('googlevideo.com') !== -1;
  } catch (e) {
    return false;
  }
}

function redirectDirectStream(res, targetUrl) {
  res.writeHead(302, {
    Location: targetUrl,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Location, Content-Length, Content-Range, Accept-Ranges',
    'Cache-Control': 'no-cache'
  });
  res.end();
}

async function handleMusicStream(req, res, pathname, query) {
  const forceProxy = String(query.proxy || '') === '1';
  const legacyNetcast = isLegacyNetcastReq(req);

  // 1. Emisora de radio en vivo (/api/ott/music/radio.mp3?id=...)
  if (pathname.indexOf('/api/ott/music/radio') === 0) {
    const id = String(query.id || '').trim();
    const radio = LIVE_RADIOS.find((r) => r.id === id) || LIVE_RADIOS[0];
    // Escudo Render Free: en TVs modernas (webOS, Tizen, Android TV, PC) redirigir 302 directo a la emisora (0 MB en Render)
    if (!forceProxy && !legacyNetcast) {
      return redirectDirectStream(res, radio.streamUrl);
    }
    return proxyUpstreamAudio(radio.streamUrl, req, res, radio.mime || 'audio/mpeg', null);
  }

  // 2. Canción bajo demanda (/api/ott/music/stream.mp4?artist=...&title=...)
  const youtubeId = String(query.v || query.youtubeId || '').trim();
  const artist = String(query.artist || '').trim();
  const title = String(query.title || '').trim();
  const trackKey = (artist + '|' + title + '|' + youtubeId).toLowerCase();

  try {
    // 2a. Caché en RAM de pista completa ensamblada (respuesta Range en <1ms)
    if (audioBufferCache.has(trackKey)) {
      const cachedBuf = audioBufferCache.get(trackKey);
      if (Date.now() - cachedBuf.ts < BUFFER_CACHE_TTL_MS) {
        return serveAudioBufferWithRange(req, res, cachedBuf.buffer, cachedBuf.mimeType);
      }
      audioBufferCache.delete(trackKey);
    }

    // 2b. Fuente primaria (100% inmune a bloqueo de IP de Render/AWS): SoundCloud Full Track -> M4A Clásico Fast-Start
    if (artist || title) {
      const scTrack = await resolveViaSoundCloudBuffer(artist, title);
      if (scTrack && scTrack.buffer && scTrack.buffer.length > 0) {
        setBoundedBufferCache(trackKey, {
          buffer: scTrack.buffer,
          mimeType: scTrack.mimeType || 'audio/mp4',
          ts: Date.now()
        });
        return serveAudioBufferWithRange(req, res, scTrack.buffer, scTrack.mimeType || 'audio/mp4');
      }
    }

    // 2c. Fuente secundaria de respaldo: YouTube / Piped / Invidious
    const stream = await resolveAudioStream({ youtubeId, artist, title });
    if (!stream || !stream.url) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, error: 'Audio no disponible para esta pista' }));
    }
    if (!forceProxy && !legacyNetcast && !isIpBoundUrl(stream.url)) {
      return redirectDirectStream(res, stream.url);
    }
    return proxyUpstreamAudio(stream.url, req, res, stream.mimeType || 'audio/mp4', stream.contentLength || null, 5, stream.userAgent || '');
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: err.message || 'Error al resolver audio' }));
    }
  }
}

const lyricsCache = new Map();
const LYRICS_CACHE_MAX = 500;
const LYRICS_CACHE_TTL = 24 * 60 * 60 * 1000;

function parseLrcToCues(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split(/\r?\n/);
  const cues = [];
  const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
  for (let i = 0; i < lines.length; i++) {
    const match = timeRegex.exec(lines[i]);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2]);
      const time = Math.round((min * 60 + sec) * 100) / 100;
      const text = match[3].trim();
      cues.push({ time, text });
    }
  }
  cues.sort((a, b) => a.time - b.time);
  return cues;
}

async function handleMusicLyrics(req, res, pathname, query) {
  let artist = String(query.artist || '').trim();
  let title = String(query.title || '').trim();
  const qParam = String(query.q || '').trim();

  // Descartar si el artista recibido es una categoría con emojis (ej. "🔥 Más Escuchado", "💃 Reggaetón")
  if (/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|Más Escuchado|Reggaetón|Salsa|Cumbia|Rock|Pop|Favoritos|Todos|Resultados de Búsqueda/i.test(artist)) {
    artist = '';
  }

  // Si el título contiene em-dash (—), en-dash (–) o guion (-), separar título y artista
  if (title.includes('—') || title.includes('–') || title.includes(' - ')) {
    const parts = title.split(/\s*[\u2014\u2013-]\s*/);
    if (parts.length >= 2) {
      if (!artist) artist = parts.slice(1).join(' - ').trim();
      title = parts[0].trim();
    }
  }

  // Si aún no tenemos artista pero vino q
  if (!artist && qParam) {
    const parts = qParam.split(/\s*[\u2014\u2013-]\s*/);
    if (parts.length >= 2) {
      title = parts[0].trim();
      artist = parts.slice(1).join(' - ').trim();
    }
  }

  // Limpiar sufijos como (Official Video), Feat., etc. para máxima compatibilidad de búsqueda
  const cleanTitle = title.replace(/\s*[\(\[](?:official\s*video|audio|video\s*oficial|visualizer|lyric\s*video|remix)[\)\]]/gi, '').trim();
  const cleanArtist = artist.split(/[,&]/)[0].trim();

  const cacheKey = (cleanArtist + '|' + cleanTitle).toLowerCase();
  if (lyricsCache.has(cacheKey)) {
    const cached = lyricsCache.get(cacheKey);
    if (Date.now() - cached.ts < LYRICS_CACHE_TTL) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      return res.end(JSON.stringify(cached.data));
    }
    lyricsCache.delete(cacheKey);
  }

  try {
    let lrclibData = null;

    // 1. Intento por Get exacto (artista + título)
    if (cleanArtist && cleanTitle) {
      const getUrl = 'https://lrclib.net/api/get?artist_name=' + encodeURIComponent(cleanArtist) + '&track_name=' + encodeURIComponent(cleanTitle);
      try {
        const getRes = await fetch(getUrl, { signal: AbortSignal.timeout(3500) });
        if (getRes.ok) {
          lrclibData = await getRes.json();
        }
      } catch (eGet) {}
    }

    // 2. Intento por Get invertido (por si vinieron intercambiados)
    if ((!lrclibData || (!lrclibData.syncedLyrics && !lrclibData.plainLyrics)) && cleanArtist && cleanTitle) {
      const swUrl = 'https://lrclib.net/api/get?artist_name=' + encodeURIComponent(cleanTitle) + '&track_name=' + encodeURIComponent(cleanArtist);
      try {
        const swRes = await fetch(swUrl, { signal: AbortSignal.timeout(3000) });
        if (swRes.ok) {
          lrclibData = await swRes.json();
        }
      } catch (eSw) {}
    }

    // 3. Intento por Búsqueda libre si no encontró exacto (artista + título)
    if ((!lrclibData || (!lrclibData.syncedLyrics && !lrclibData.plainLyrics)) && (cleanTitle || title)) {
      const searchQuery = (cleanArtist ? (cleanArtist + ' ') : '') + (cleanTitle || title);
      const sUrl = 'https://lrclib.net/api/search?q=' + encodeURIComponent(searchQuery);
      try {
        const sRes = await fetch(sUrl, { signal: AbortSignal.timeout(3500) });
        if (sRes.ok) {
          const sList = await sRes.json();
          if (Array.isArray(sList) && sList.length > 0) {
            const syncedCandidate = sList.find((item) => item.syncedLyrics) || sList[0];
            if (syncedCandidate) lrclibData = syncedCandidate;
          }
        }
      } catch (eSearch) {}
    }

    // 4. Intento por Búsqueda libre solo por título
    if ((!lrclibData || (!lrclibData.syncedLyrics && !lrclibData.plainLyrics)) && cleanTitle) {
      const sUrl2 = 'https://lrclib.net/api/search?q=' + encodeURIComponent(cleanTitle);
      try {
        const sRes2 = await fetch(sUrl2, { signal: AbortSignal.timeout(3500) });
        if (sRes2.ok) {
          const sList2 = await sRes2.json();
          if (Array.isArray(sList2) && sList2.length > 0) {
            const syncedCandidate2 = sList2.find((item) => item.syncedLyrics) || sList2[0];
            if (syncedCandidate2) lrclibData = syncedCandidate2;
          }
        }
      } catch (eSearch2) {}
    }

    let payload = { ok: false, error: 'Letra no encontrada' };
    if (lrclibData) {
      if (lrclibData.syncedLyrics) {
        const cues = parseLrcToCues(lrclibData.syncedLyrics);
        if (cues.length > 0) {
          payload = {
            ok: true,
            synced: true,
            trackName: lrclibData.trackName || title,
            artistName: lrclibData.artistName || artist,
            cues
          };
        }
      } else if (lrclibData.plainLyrics) {
        payload = {
          ok: true,
          synced: false,
          trackName: lrclibData.trackName || title,
          artistName: lrclibData.artistName || artist,
          plain: lrclibData.plainLyrics
        };
      }
    }

    if (lyricsCache.size >= LYRICS_CACHE_MAX) {
      const firstKey = lyricsCache.keys().next().value;
      lyricsCache.delete(firstKey);
    }
    lyricsCache.set(cacheKey, { ts: Date.now(), data: payload });

    res.writeHead(payload.ok ? 200 : 404, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ ok: false, error: err.message || 'Error al obtener letra' }));
  }
}

module.exports = {
  LIVE_RADIOS,
  CURATED_TRACKS,
  buildMusicM3u,
  searchItunesTracks,
  resolveYouTubeId,
  resolveAudioStream,
  handleMusicStream,
  handleMusicLyrics,
  parseLrcToCues,
  isIpBoundUrl
};
