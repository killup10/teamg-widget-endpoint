const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const cabinetHtml = fs.readFileSync('web/cabinet.html', 'utf8');

// Extraer isSeriesGroup
const match = cabinetHtml.match(/function isSeriesGroup\([\s\S]*?\n\}/);
assert.ok(match, 'isSeriesGroup must be defined in cabinet.html');

const sandbox = {};
vm.runInNewContext(match[0], sandbox);
const { isSeriesGroup } = sandbox;

// 1. Título con EP. 1 (como en el pantallazo de La Guerrera)
const laGuerreraChannels = [
  { name: 'EP. 1 El viaje', group: 'La Guerrera' },
  { name: 'EP. 2 Tráfico de bebés', group: 'La Guerrera' }
];
assert.equal(isSeriesGroup(laGuerreraChannels, 'La Guerrera', { name: 'General' }), true, 'Debe detectar EP. 1 como serie');

// 2. Título con T1 E1 (como en el pantallazo de Al Diablo con los Guapos)
const alDiabloChannels = [
  { name: 'T1 E1 - El encuentro: Milagros llega a la mansión Belm...', group: 'Al Diablo con los Guapos' }
];
assert.equal(isSeriesGroup(alDiabloChannels, 'Al Diablo con los Guapos', { name: 'General' }), true, 'Debe detectar T1 E1 como serie');

// 3. Título en playlist "Novelas Top" (independientemente del nombre del canal)
const arbitraryChannels = [
  { name: 'Inicio', group: 'Novela Misterio' }
];
assert.equal(isSeriesGroup(arbitraryChannels, 'Novela Misterio', { name: 'Novelas Top' }), true, 'Playlist con palabra "Novelas" debe permitir carátula en todos sus títulos');

// 4. Cap. / Capítulo / E1 / 01 -
assert.equal(isSeriesGroup([{ name: 'Cap. 15' }], 'Grupo', { name: 'VOD' }), true);
assert.equal(isSeriesGroup([{ name: 'Capítulo 1' }], 'Grupo', { name: 'VOD' }), true);
assert.equal(isSeriesGroup([{ name: 'E1 - Piloto' }], 'Grupo', { name: 'VOD' }), true);
assert.equal(isSeriesGroup([{ name: '01 - Piloto' }], 'Grupo', { name: 'VOD' }), true);
assert.equal(isSeriesGroup([{ name: '1x05 Especial' }], 'Grupo', { name: 'VOD' }), true);

// 5. Canal con seriesLogo o seriesPoster previo
assert.equal(isSeriesGroup([{ name: 'Capítulo Sin Numero', seriesLogo: 'https://img.com/1.jpg' }], 'Grupo', { name: 'Lista' }), true);

// 6. Canales en vivo normales en playlist en vivo
const liveChannels = [
  { name: 'CNN En Español', group: 'Noticias' },
  { name: 'ESPN HD', group: 'Deportes' }
];
assert.equal(isSeriesGroup(liveChannels, 'Noticias', { name: 'Canales en Vivo' }), false, 'No debe marcar automáticamente canales de TV en vivo como serie');

console.log('Todos los casos de detección de series y novelas pasaron exitosamente.');
