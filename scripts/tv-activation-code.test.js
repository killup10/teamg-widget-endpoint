// Test unitario para la funcionalidad de activación remota por código TV de 12 horas.
const assert = require('assert');
const http = require('http');
const store = require('../ott-store');
const api = require('../ott-api');

async function runTests() {
  console.log('[Test TV Activation Code] Iniciando pruebas...');

  // Configurar entorno en memoria y admin
  process.env.ADMIN_KEY = 'test-admin-secret-key';
  process.env.TOKEN_SECRET = 'test-token-secret';
  const cols = await store.init();

  // Crear usuario cliente de prueba
  const testSalt = '12345678';
  const testUser = {
    _id: 'user_test_client_1',
    login: 'cliente_vip_demo',
    salt: testSalt,
    pass: store.hashPass('123456', testSalt),
    role: 'fake',
    active: true,
    created: store.nowIso()
  };
  await cols.users.insertOne(testUser);

  // Crear playlist de prueba
  const testPlaylist = {
    _id: 'pl_test_1',
    name: 'Lista Canales Premium',
    url: 'https://example.com/playlist.m3u',
    created: store.nowIso()
  };
  await cols.playlists.insertOne(testPlaylist);

  // Helper para simular llamadas al handler de ott-api
  function request(method, pathname, query = {}, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = {
        method,
        headers: { host: 'localhost', ...headers },
      };
      let statusCode = 200;
      let resHeaders = {};
      let responseBody = '';

      const res = {
        writeHead(code, h) {
          statusCode = code;
          if (h) Object.assign(resHeaders, h);
        },
        setHeader(k, v) { resHeaders[k] = v; },
        end(data) {
          if (data) responseBody += data;
          try {
            const parsed = responseBody ? JSON.parse(responseBody) : {};
            resolve({ status: statusCode, headers: resHeaders, body: parsed });
          } catch (e) {
            resolve({ status: statusCode, headers: resHeaders, body: responseBody });
          }
        }
      };

      api.handle(req, res, pathname, query, body).catch(reject);
    });
  }

  // 1. GENERAR CÓDIGO DESDE TV (POST /api/ott/code/generate)
  const devId = 'tv-room-48912';
  const genRes = await request('POST', '/api/ott/code/generate', {}, {
    deviceId: devId,
    name: 'LG OLED 55 TV',
    platform: 'LG webOS TV'
  });

  assert.strictEqual(genRes.status, 200, 'Debe responder 200 al generar código');
  assert.strictEqual(genRes.body.ok, true, 'ok debe ser true');
  assert.strictEqual(typeof genRes.body.code, 'string', 'code debe ser string');
  assert.match(genRes.body.code, /^\d{3}-\d{3}$/, 'code debe tener formato XXX-XXX (6 dígitos)');
  assert.strictEqual(genRes.body.expiresInHours, 12, 'Expiración debe ser de 12 horas');
  const now = Date.now();
  const diffHours = (genRes.body.expiresAt - now) / (3600 * 1000);
  assert(diffHours >= 11.9 && diffHours <= 12.1, 'expiresAt debe ser aproximadamente 12 horas en el futuro');

  const generatedCode = genRes.body.code;
  console.log('✓ 1. Código generado con éxito para TV:', generatedCode, 'expira en ~12h');

  // Re-solicitar código para el mismo TV devuelve el mismo código activo
  const genRes2 = await request('POST', '/api/ott/code/generate', {}, {
    deviceId: devId,
    name: 'LG OLED 55 TV',
    platform: 'LG webOS TV'
  });
  assert.strictEqual(genRes2.body.code, generatedCode, 'Debe reutilizar el código activo no expirado');
  assert.strictEqual(genRes2.body.reused, true, 'reused debe ser true');
  console.log('✓ 2. Reutilización de código activo confirmada');

  // 2. POLLING DESDE TV ANTES DE ACTIVAR (GET /api/ott/code/status)
  const statusRes1 = await request('GET', '/api/ott/code/status', {
    code: generatedCode,
    deviceId: devId
  });
  assert.strictEqual(statusRes1.status, 200);
  assert.strictEqual(statusRes1.body.ok, true);
  assert.strictEqual(statusRes1.body.activated, false, 'Aún no debe estar activado');
  console.log('✓ 3. Estado previo a activación es activated: false');

  // 3. INTENTO DE ACTIVACIÓN SIN PERMISOS DE ADMIN (Debe fallar)
  const nonAdminRes = await request('POST', '/api/ott/admin/code/activate', {}, {
    code: generatedCode,
    userId: testUser._id
  }, { 'x-admin-key': 'clave-invalida' });
  assert.strictEqual(nonAdminRes.status, 403, 'Debe rechazar activación si no es admin');
  console.log('✓ 4. Activación protegida: solo el admin puede activar');

  // 4. ACTIVACIÓN EXITOSA POR EL ADMIN (POST /api/ott/admin/code/activate)
  const adminRes = await request('POST', '/api/ott/admin/code/activate', {}, {
    code: generatedCode,
    userId: testUser._id,
    note: 'TV Sala Principal - Don Juan',
    playlistIds: [testPlaylist._id]
  }, { 'x-admin-key': 'test-admin-secret-key' });

  assert.strictEqual(adminRes.status, 200, 'Admin debe recibir 200 OK');
  assert.strictEqual(adminRes.body.ok, true, 'ok debe ser true');
  assert.strictEqual(adminRes.body.deviceId, devId, 'deviceId debe coincidir');
  assert.strictEqual(adminRes.body.user, testUser.login, 'user login debe coincidir');
  console.log('✓ 5. Activación realizada con éxito por el admin');

  // 5. POLLING DESDE TV DESPUÉS DE ACTIVACIÓN
  const statusRes2 = await request('GET', '/api/ott/code/status', {
    code: generatedCode,
    deviceId: devId
  });
  assert.strictEqual(statusRes2.status, 200);
  assert.strictEqual(statusRes2.body.ok, true);
  assert.strictEqual(statusRes2.body.activated, true, 'Ahora debe estar activado');
  assert(statusRes2.body.token, 'Debe incluir token de sesión para la TV');
  assert.strictEqual(statusRes2.body.user.login, testUser.login, 'Debe incluir usuario');
  assert.strictEqual(statusRes2.body.playlists.length, 1, 'Debe incluir playlist asignada');
  assert.strictEqual(statusRes2.body.playlists[0].id, testPlaylist._id);
  console.log('✓ 6. Polling de TV recibe token y listas asignadas de inmediato');

  // 6. VERIFICAR QUE LA TV PUEDE CONSUMIR /api/ott/feed CON EL TOKEN RECIBIDO
  const feedRes = await request('GET', '/api/ott/feed', {
    token: statusRes2.body.token,
    deviceId: devId
  });
  assert.strictEqual(feedRes.status, 200);
  assert.strictEqual(feedRes.body.ok, true);
  assert.strictEqual(feedRes.body.playlists.length, 1);
  assert.strictEqual(feedRes.body.playlists[0].name, testPlaylist.name);
  console.log('✓ 7. TV autorizada reproduce feed con el nuevo token');

  // 7. LISTADO ADMIN DE CÓDIGOS (GET /api/ott/admin/codes)
  const adminCodesRes = await request('GET', '/api/ott/admin/codes', {}, {}, { 'x-admin-key': 'test-admin-secret-key' });
  assert.strictEqual(adminCodesRes.status, 200);
  assert(Array.isArray(adminCodesRes.body.codes), 'codes debe ser array');
  const foundCode = adminCodesRes.body.codes.find(c => c.code === generatedCode);
  assert(foundCode, 'El código debe aparecer en la lista del panel admin');
  assert.strictEqual(foundCode.activated, true, 'El código debe figurar como activado');
  console.log('✓ 8. Admin puede auditar y visualizar códigos en Cabinet');
  const second = await request('POST', '/api/ott/code/generate', {}, {
    deviceId: 'tv-second', name: 'Segunda TV', platform: 'LG NetCast'
  });
  const secondActivation = await request('POST', '/api/ott/admin/code/activate', {}, {
    code: second.body.code, userId: testUser._id, playlistIds: [testPlaylist._id]
  }, { 'x-admin-key': 'test-admin-secret-key' });
  assert.strictEqual(secondActivation.status, 200, 'The same fake-user can activate a second device');
  const firstStillWorks = await request('GET', '/api/ott/feed', {
    token: statusRes2.body.token, deviceId: devId
  });
  assert.strictEqual(firstStillWorks.status, 200, 'Activating a second device must preserve the first');
  console.log('✓ 9. Un fake-user activa dos dispositivos sin quitar el primero');

  console.log('\n========================================');
  console.log('TODAS LAS PRUEBAS DE ACTIVACIÓN POR CÓDIGO PASARON EXITOSAMENTE (100% OK)');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('[TEST ERROR]:', err);
  process.exit(1);
});
