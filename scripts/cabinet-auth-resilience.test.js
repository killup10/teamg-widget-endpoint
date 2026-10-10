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

console.log('Cabinet auth and overview resilience unit tests pass successfully.');
