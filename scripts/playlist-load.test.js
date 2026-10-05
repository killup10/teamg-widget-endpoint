const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const source = html.slice(html.indexOf('function loadPlaylistContent('), html.indexOf('function buildGroups('));
function setup(failRendering) {
  const timers = new Map();
  let nextTimer = 0;
  const area = {};
  const requests = [];
  const ctx = {
    state: {auth: {token: 'test', deviceId: 'tv'}}, API_BASE: '',
    $: () => area, escapeHtml: s => s,
    setTimeout: (fn, delay) => { timers.set(++nextTimer, {fn, delay}); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    XMLHttpRequest: function() {
      requests.push(this); this.open = () => {}; this.send = () => {};
      this.abort = () => { this.aborted = true; };
    },
    parseM3U: () => [{name: 'Película'}], aggregateSeriesList: x => x,
    buildGroups: () => { ctx.state.groups = ['Cine']; },
    renderChannels: () => { if (failRendering) throw new Error('TV render failure'); area.innerHTML = 'Película'; }
  };
  for (const name of ['restorePlaylistSurface', 'renderTabs', 'updateTopBar', 'updateMainFocus', 'showToast', 'resolveRecentContent', 'updateSearchVisibility']) ctx[name] = () => {};
  vm.createContext(ctx); vm.runInContext(source, ctx);
  ctx.loadPlaylistContent({id: 'cinema', name: 'Cine'});
  return {ctx, area, requests, timers};
}
for (const fail of [false, true]) {
  const t = setup(fail), xhr = t.requests[0];
  xhr.readyState = 4; xhr.status = 200; xhr.responseText = '#EXTM3U'; xhr.onreadystatechange();
  assert.equal(t.timers.size, 0);
  assert.match(t.area.innerHTML, fail ? /TV render failure/ : /Película/);
}
const t = setup(false);
for (let i = 0; i < 4; i++) {
  const timeout = [...t.timers.values()].find(x => x.delay === 45000);
  assert.ok(timeout); timeout.fn();
  assert.equal(t.requests[i].aborted, true);
  const retry = [...t.timers.entries()].find(([, x]) => x.delay === 3500);
  if (retry) { t.timers.delete(retry[0]); retry[1].fn(); }
}
assert.match(t.area.innerHTML, /Error cargando playlist/);
const switched = setup(false);
const previous = switched.requests[0];
switched.ctx.loadPlaylistContent({id: 'series', name: 'Series'});
assert.equal(previous.aborted, true);
previous.readyState = 4; previous.status = 200; previous.responseText = '#EXTM3U';
previous.onreadystatechange();
assert.match(switched.area.innerHTML, /Cargando Series/);
assert.equal(switched.ctx.state.currentPlaylist.id, 'series');
assert.equal(switched.timers.size, 1);
const apiSource = html.slice(html.indexOf('function apiCall('), html.indexOf('var KB_ROWS'));
const apiTimers = new Map();
const results = [];
let apiRequest;
const apiContext = {
  API_BASE: '', clearTimeout: id => apiTimers.delete(id),
  setTimeout: fn => { apiTimers.set(1, fn); return 1; },
  XMLHttpRequest: function() {
    apiRequest = this; this.open = () => {}; this.send = () => {};
    this.abort = () => { this.aborted = true; this.readyState = 4; this.status = 0; this.onreadystatechange(); };
  }
};
vm.createContext(apiContext); vm.runInContext(apiSource, apiContext);
apiContext.apiCall('GET', '/feed', null, status => results.push(status));
apiTimers.get(1)();
assert.deepEqual(results, [0]);
assert.equal(apiRequest.aborted, true);
assert.equal(apiTimers.size, 0);
console.log('Playlist success, TV rendering errors, and bounded timeout retries pass.');
