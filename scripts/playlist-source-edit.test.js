const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function main() {
  const html = fs.readFileSync('web/cabinet.html', 'utf8');
  const elements = {};
  const element = id => elements[id] ||= {
    value: '', style: {}, attrs: {},
    getAttribute(key) { return this.attrs[key] ?? null; },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    focus() {}
  };
  const sourceButton = element('sourceButton');
  sourceButton.setAttribute('data-source-pl', 'existing');
  const playlist = { id: 'existing', name: 'Mi lista', url: 'https://old.example/list.m3u', epgUrl: 'https://example.com/epg', badge: 'Especial' };
  let payload;
  const context = {
    DATA: { playlists: [playlist] }, esc: s => s || '', bindDel() {},
    document: { getElementById: element, querySelectorAll: selector => selector.includes('[data-source-pl]') ? [sourceButton] : [] },
    window: { scrollTo() {} }, refresh() {},
    api: async (url, method, body) => { payload = body; }
  };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function renderPlaylistsList('), html.indexOf('function loadPlaylistChannels(')), context);
  const app = {};
  context.renderPlaylistsList(app);
  assert.ok(app.innerHTML.includes('Cambiar M3U'));
  sourceButton.onclick();
  assert.equal(element('pid').value, 'existing');
  assert.equal(element('pu').value, playlist.url);
  assert.equal(element('bp').textContent, 'Guardar M3U');
  element('pu').value = 'invalid';
  element('bp').onclick();
  assert.equal(payload, undefined);
  element('pu').value = 'https://new.example/list.m3u';
  element('bp').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), { id: 'existing', url: 'https://new.example/list.m3u', epgUrl: playlist.epgUrl });

  // Run the actual update route against an existing document with saved content.
  const api = fs.readFileSync('ott-api.js', 'utf8');
  const start = api.indexOf("if (sub === 'playlist' && req.method === 'POST')");
  const end = api.indexOf("if (sub === 'playlist/halloween'", start);
  const saved = { _id: 'existing', name: playlist.name, url: playlist.url, customM3u: '#EXTM3U\nSaved content', count: 7, badge: 'Especial' };
  const route = new Function('cols', 'body', 'store', 'json', 'res', 'normalizeColor', 'normalizeBadge', 'normalizeExpires', 'HALLOWEEN_ORANGE', 'sub', 'req', 'return (async () => {' + api.slice(start, end) + '})()');
  await route({ playlists: {
    findOne: async () => saved,
    updateOne: async (filter, update) => { assert.equal(filter._id, 'existing'); Object.assign(saved, update.$set); },
    insertOne: async () => { throw new Error('Must update the existing list'); }
  } }, payload, { nowIso: () => 'now' }, () => {}, {}, x => x || '', x => x || '', x => x || '', '#ff6a00', 'playlist', { method: 'POST' });
  assert.equal(saved.url, payload.url);
  assert.equal(saved.customM3u, '#EXTM3U\nSaved content');
  assert.equal(saved.count, 7);
  assert.equal(saved.badge, 'Especial');
  assert.equal(saved.name, playlist.name);
  element('bc').onclick();
  assert.equal(element('pid').getAttribute('data-source'), null);
  assert.equal(element('pn').disabled, false);
  console.log('Changing M3U preserves playlist identity, saved content and metadata.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
