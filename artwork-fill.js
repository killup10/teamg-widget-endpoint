// Patch original M3U blocks, retaining stream options and unknown attributes.
const crypto = require('crypto');
const revision = text => crypto.createHash('sha256').update(text).digest('hex');
function fillArtwork(text, entries) {
  const wanted = new Map();
  const wantedSeriesLogo = new Map();
  const wantedSeriesPoster = new Map();
  for (const e of entries) {
    if (!e.name || !e.url || !/^https:\/\/[^\s"<>]+$/.test(e.logo || '')) throw new Error('Carátula o identificación inválida');
    if (e.seriesLogo && !/^https:\/\/[^\s"<>]+$/.test(e.seriesLogo)) throw new Error('Carátula de serie inválida');
    if (e.seriesPoster && !/^https:\/\/[^\s"<>]+$/.test(e.seriesPoster)) throw new Error('Póster de serie inválido');
    const key = JSON.stringify([e.name, e.group || 'General', e.url]);
    if (wanted.has(key) && wanted.get(key) !== e.logo) throw new Error('Carátulas contradictorias');
    wanted.set(key, e.logo);
    if (e.seriesLogo) wantedSeriesLogo.set(key, e.seriesLogo);
    if (e.seriesPoster) wantedSeriesPoster.set(key, e.seriesPoster);
  }
  let changed = 0, preserved = 0;
  const matched = new Set();
  const result = String(text).replace(/^#EXTINF[^\r\n]*(?:\r?\n(?!#EXTINF)[^\r\n]*)*/gm, block => {
    const lines = block.split(/\r?\n/);
    const first = lines[0];
    const delim = first.match(/^#EXTINF:(?:[^",]|"[^"]*")*,/);
    if (!delim) return block;
    const name = first.slice(delim[0].length).trim();
    let group = (first.match(/group-title="([^"]*)"/i) || [null, 'General'])[1] || 'General';
    let url = '', hasImage = /tvg-logo="[^"\s][^"]*"/i.test(first);
    for (const line of lines.slice(1)) {
      if (line.startsWith('#EXTGRP:')) group = line.slice(8).trim() || group;
      if (line.startsWith('#EXTIMG:') && line.slice(8).trim()) hasImage = true;
      if (line.trim() && !line.trim().startsWith('#')) { url = line.trim(); break; }
    }
    const key = JSON.stringify([name, group, url]);
    const logo = wanted.get(key);
    if (!logo) return block;
    matched.add(key);
    if (hasImage) { preserved++; return block; }
    if (/tvg-logo="[^"]*"/i.test(first)) lines[0] = first.replace(/tvg-logo="[^"]*"/i, 'tvg-logo="' + logo + '"');
    else lines[0] = first.slice(0, delim[0].length - 1) + ' tvg-logo="' + logo + '"' + first.slice(delim[0].length - 1);
    
    const sLogo = wantedSeriesLogo.get(key);
    if (sLogo) {
      if (/series-logo="[^"]*"/i.test(lines[0])) {
        if (/series-logo=""/i.test(lines[0])) lines[0] = lines[0].replace(/series-logo=""/i, 'series-logo="' + sLogo + '"');
      } else {
        const d = lines[0].match(/^#EXTINF:(?:[^",]|"[^"]*")*,/);
        lines[0] = lines[0].slice(0, d[0].length - 1) + ' series-logo="' + sLogo + '"' + lines[0].slice(d[0].length - 1);
      }
    }
    const sPoster = wantedSeriesPoster.get(key);
    if (sPoster) {
      if (/series-poster="[^"]*"/i.test(lines[0])) {
        if (/series-poster=""/i.test(lines[0])) lines[0] = lines[0].replace(/series-poster=""/i, 'series-poster="' + sPoster + '"');
      } else {
        const d = lines[0].match(/^#EXTINF:(?:[^",]|"[^"]*")*,/);
        lines[0] = lines[0].slice(0, d[0].length - 1) + ' series-poster="' + sPoster + '"' + lines[0].slice(d[0].length - 1);
      }
    }

    for (let i = 1; i < lines.length; i++) if (lines[i].startsWith('#EXTIMG:')) lines[i] = '#EXTIMG:' + logo;
    changed++;
    return lines.join(block.includes('\r\n') ? '\r\n' : '\n');
  });
  if (matched.size !== wanted.size) throw new Error('La lista cambió o hay títulos sin coincidencia exacta');
  return { text: result, changed, preserved };
}
module.exports = { fillArtwork, revision };
