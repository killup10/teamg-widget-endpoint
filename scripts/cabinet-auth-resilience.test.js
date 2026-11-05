const assert = require('assert');
const fs = require('fs');
const path = require('path');

const cabinetHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'cabinet.html'), 'utf8');
const ottApi = fs.readFileSync(path.join(__dirname, '..', 'ott-api.js'), 'utf8');

// 1. Verify 401 & 403 handling with session cleanup in cabinet.html
assert.ok(
  cabinetHtml.includes('r.status === 403 || r.status === 401'),
  'cabinet.html must check both 403 and 401 for expired or invalid auth'
);
assert.ok(
  cabinetHtml.includes('sessionStorage.removeItem("ottkey")'),
  'cabinet.html must clear expired token from sessionStorage'
);

// 2. Verify timeout and AbortController protection in cabinet.html
assert.ok(
  cabinetHtml.includes('AbortController'),
  'cabinet.html must guard fetch calls with AbortController to avoid hanging forever'
);

// 3. Verify refresh() has catch block and user-facing error UI
assert.ok(
  cabinetHtml.includes('.catch(function(err)'),
  'refresh() in cabinet.html must have a .catch block'
);
assert.ok(
  cabinetHtml.includes('No se pudo conectar con el servidor'),
  'cabinet.html must show a clear error card if loading overview fails'
);
assert.ok(
  cabinetHtml.includes('↻ Reintentar'),
  'cabinet.html must provide a Retry button'
);

// 4. Verify overview in ott-api.js has try/catch and handles null elements gracefully
assert.ok(
  ottApi.includes('catch (errOverview)'),
  'ott-api.js overview must be wrapped in try/catch'
);
assert.ok(
  ottApi.includes('filter(Boolean)'),
  'ott-api.js overview must filter out null/falsy records'
);

// 5. Verify Cabinet device expiration notification (expired devices + up to 2 days before)
const vm = require('vm');
const expStart = cabinetHtml.indexOf('var EXPIRY_ALERT_COLLAPSED = false;');
const expEnd = cabinetHtml.indexOf('function render() {');
const expCode = cabinetHtml.slice(expStart, expEnd);
const alertWrap = { style: { display: 'none' }, innerHTML: '', querySelectorAll() { return []; } };
const ctx = {
  DATA: {
    serverDate: '2026-11-05',
    users: [
      { id: 'u1', login: 'juan_perez', expires: '' },
      { id: 'u2', login: 'maria_lopez', expires: '2026-11-06' }
    ],
    devices: [
      { id: 'd_overdue', userId: 'u1', name: 'Samsung Tizen', note: 'TV Sala Juan', paymentDueDate: '2026-11-02' },
      { id: 'd_today', userId: 'u1', name: 'LG WebOS', note: 'TV Dormitorio', paymentDueDate: '2026-11-05' },
      { id: 'd_1day_user', userId: 'u2', name: 'Android TV', note: 'TV Maria', paymentDueDate: '' },
      { id: 'd_2days', userId: 'u1', name: 'Fire TV', note: 'TV Cocina', paymentDueDate: '2026-11-07' },
      { id: 'd_3days', userId: 'u1', name: 'Sony TV', note: 'TV Lejana', paymentDueDate: '2026-11-08' },
      { id: 'd_nodate', userId: 'u1', name: 'TCL TV', note: 'TV Sin Fecha', paymentDueDate: '' }
    ]
  },
  esc: s => String(s == null ? '' : s),
  document: { getElementById: id => (id === 'expiryAlertWrap' ? alertWrap : null) }
};
vm.createContext(ctx);
vm.runInContext(expCode, ctx);
const list = ctx.getExpiringDevicesList();
assert.strictEqual(list.length, 4, 'Must include overdue, today, 1 day, and 2 days before, excluding >= 3 days and empty dates');
assert.deepStrictEqual(Array.from(list, x => x.device.id), ['d_overdue', 'd_today', 'd_1day_user', 'd_2days']);
assert.strictEqual(list[0].status.label, 'Venció hace 3 días');
assert.strictEqual(list[1].status.label, 'Vence hoy');
assert.strictEqual(list[2].status.label, 'Vence mañana (falta 1 día)');
assert.strictEqual(list[3].status.label, 'Vence en 2 días');
ctx.renderExpiryNotification(list);
assert.strictEqual(alertWrap.style.display, 'block');
assert.ok(alertWrap.innerHTML.includes('1 dispositivo vencido · 3 por vencer (≤ 2 días)'));
assert.ok(alertWrap.innerHTML.includes('TV Sala Juan'));
assert.ok(alertWrap.innerHTML.includes('TV Cocina'));
assert.ok(!alertWrap.innerHTML.includes('TV Lejana'));

console.log('Cabinet auth and overview resilience unit tests pass successfully.');
