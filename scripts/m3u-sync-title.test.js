// Test unitario para verificar que al actualizar desde la fuente M3U se reconocen nuevos títulos y grupos
const assert = require('assert');
const store = require('../ott-store');
const api = require('../ott-api');

async function run() {
  console.log('[Test M3U Sync Title] Iniciando pruebas...');

  process.env.ADMIN_KEY = 'test-admin-key';
  const cols = await store.init();

  // Caso específico del usuario:
  // Canales que estaban previamente con otro nombre o grupo, y ahora se actualizan a:
  // T1 E1 - El muerto enfermo de amor
  // Grupo: Strange Junji Itos Tales for Sleepless Nights
  const userM3u = `#EXTM3U


#EXTINF:0,T1 E1 - El muerto enfermo de amor
#EXTGRP:Strange Junji Itos Tales for Sleepless Nights
https://teamg.store/lachispadelamor1x1.mkv
#EXTINF:0,T1 E2 - Tomio y el jersey rojo de cuello alto 
#EXTGRP:Strange Junji Itos Tales for Sleepless Nights
https://teamg.store/lachispadelamor1x2.mkv
#EXTINF:0,T1 E3 - The Mansion of Phantom Pain
#EXTGRP:Strange Junji Itos Tales for Sleepless Nights
https://teamg.store/lachispadelamor1x3.mkv
`;

  // 1. Probar parseM3uText: NO debe crear un grupo fantasma 'General' vacío
  // Helper para simular llamadas al handler
  let reqBody = '';
  function request(method, pathname, query = {}, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = { method, headers: { host: 'localhost', ...headers } };
      let statusCode = 200, resHeaders = {}, resData = '';
      const res = {
        writeHead(c, h) { statusCode = c; if (h) Object.assign(resHeaders, h); },
        setHeader(k, v) { resHeaders[k] = v; },
        end(d) {
          if (d) resData += d;
          try { resolve({ status: statusCode, body: JSON.parse(resData) }); }
          catch (e) { resolve({ status: statusCode, body: resData }); }
        }
      };
      api.handle(req, res, pathname, query, body).catch(reject);
    });
  }

  // Crear playlist con canales anteriores
  const plId = 'pl_sync_test_' + Date.now();
  const oldCustomM3u = `#EXTM3U
#EXTINF:-1 group-title="La chispa del amor",La chispa del amor 1x1
https://teamg.store/lachispadelamor1x1.mkv
#EXTINF:-1 group-title="La chispa del amor",La chispa del amor 1x2
https://teamg.store/lachispadelamor1x2.mkv
`;

  // Guardar playlist en base de datos
  await cols.playlists.insertOne({
    _id: plId,
    name: 'Anime y Series',
    url: 'https://example.com/source.m3u',
    customM3u: oldCustomM3u,
    created: store.nowIso()
  });

  // Mock global.fetch para devolver userM3u cuando se pida la fuente
  const originalFetch = global.fetch;
  global.fetch = async function(url) {
    return {
      ok: true,
      status: 200,
      text: async () => userM3u
    };
  };

  try {
    const res = await request('POST', '/api/ott/admin/playlist/sync-source', {}, { id: plId }, { 'x-admin-key': 'test-admin-key' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    const channels = res.body.channels;
    const groups = res.body.groups;

    console.log('Grupos resultantes:', groups);
    assert.deepStrictEqual(groups, ['Strange Junji Itos Tales for Sleepless Nights'], 'Solo debe quedar el grupo real de la serie, no General vacío ni grupos viejos sin canales');

    assert.strictEqual(channels.length, 3, 'Deben haber 3 episodios');
    assert.strictEqual(channels[0].group, 'Strange Junji Itos Tales for Sleepless Nights');
    assert.strictEqual(channels[1].group, 'Strange Junji Itos Tales for Sleepless Nights');
    assert.strictEqual(channels[2].group, 'Strange Junji Itos Tales for Sleepless Nights');

    // Verificar que los títulos fueron actualizados con el nuevo nombre
    const ch1 = channels.find(c => c.url === 'https://teamg.store/lachispadelamor1x1.mkv');
    assert(ch1, 'Canal 1 debe existir');
    assert.strictEqual(ch1.name, 'T1 E1 - El muerto enfermo de amor', 'El título del canal 1 debe haberse actualizado');

    const ch2 = channels.find(c => c.url === 'https://teamg.store/lachispadelamor1x2.mkv');
    assert(ch2, 'Canal 2 debe existir');
    assert.strictEqual(ch2.name, 'T1 E2 - Tomio y el jersey rojo de cuello alto', 'El título del canal 2 debe haberse actualizado');

    const ch3 = channels.find(c => c.url === 'https://teamg.store/lachispadelamor1x3.mkv');
    assert(ch3, 'Canal 3 debe existir');
    assert.strictEqual(ch3.name, 'T1 E3 - The Mansion of Phantom Pain', 'El título del canal 3 debe haberse agregado');

    assert.strictEqual(res.body.added, 1, '1 episodio nuevo agregado');
    assert.strictEqual(res.body.updated, 2, '2 episodios existentes actualizados de nombre y grupo');

    console.log('✓ sync-source actualizó correctamente los nuevos títulos y grupos desde la fuente');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n========================================');
  console.log('TODAS LAS PRUEBAS DE M3U SYNC TITLE PASARON CON ÉXITO');
  console.log('========================================\n');
}

run().catch(err => {
  console.error('[TEST FAIL]:', err);
  process.exit(1);
});
