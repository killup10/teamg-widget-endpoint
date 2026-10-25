const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('ott/index.html', 'utf8');
const elements = {};
function element(id) {
  return elements[id] || (elements[id] = {style:{}, classList:{add(){},remove(){}}, scrollTop:0, scrollLeft:0});
}
let now = new Date(2026, 9, 25, 10, 0).getTime();
const RealDate = Date;
class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } }
let stored;
const ctx = {Date:TestDate, state:{auth:{}}, $:element, saveStorage(){ stored = JSON.stringify(ctx.state.auth); }, updateOptionsDisplay(){}, formatTime:n=>String(n), setInterval(){}};
vm.createContext(ctx);
function load(name) {
  const start = html.indexOf('function ' + name + '(');
  const end = html.indexOf('\nfunction ', start + 1);
  vm.runInContext(html.slice(start, end), ctx);
}
vm.runInContext(html.slice(html.indexOf('var DAYS ='), html.indexOf('setInterval(updateClock')), ctx);
assert.equal(ctx.saveManualClock('31/02/2026 12:00'), false);
assert.equal(ctx.saveManualClock('25/10/2026 24:00'), false);
assert.equal(ctx.saveManualClock('25/10/2026 14:60'), false);
assert.equal(ctx.saveManualClock('invalid'), false);
assert.equal(stored, undefined, 'Invalid dates must not overwrite saved settings');
assert.equal(ctx.saveManualClock('25/10/2026 14:30'), true);
assert.match(element('liveClock').innerHTML, /domingo 25 de octubre de 2026.*14:30:00/);
now += 61000;
ctx.state.auth = JSON.parse(stored); // Simulate reopening the app with persisted settings.
ctx.updateClock();
assert.match(element('liveClock').innerHTML, /14:31:01/);
ctx.state.auth.clockFormat = '12'; ctx.updateClock();
assert.match(element('liveClock').innerHTML, /02:31:01 p\. m\./);
ctx.state.auth.clockMode = 'auto'; ctx.state.auth.clockFormat = '24'; ctx.updateClock();
assert.match(element('liveClock').innerHTML, /10:01:01/);
assert.equal(now, new TestDate().getTime(), 'Setting the app clock must never modify system time');

load('updateDurationDisplay'); load('updateProgressDisplay');
ctx.state.recoveryVod = true; ctx.updateDurationDisplay({currentTime:0, duration:NaN});
assert.match(element('player-time-text').textContent, /Duración pendiente/);
ctx.updateProgressDisplay({currentTime:0, duration:NaN});
assert.equal(element('player-epg-fill').style.width, '0%');
ctx.state.recoveryVod = false; ctx.updateDurationDisplay({currentTime:0, duration:Infinity});
assert.match(element('player-time-text').textContent, /EN VIVO/);
ctx.state.recoveryVod = true; ctx.updateDurationDisplay({currentTime:20, duration:100});
assert.equal(element('player-time-text').textContent, '20 / 100');

load('captureCatalogNavigation'); load('restoreCatalogNavigation'); load('closeSeriesDetail');
Object.assign(ctx.state, {currentPlaylist:{id:'anime'},currentGroup:'Boruto',currentPage:3,tileIdx:7,tabIdx:8,currentFocusArea:'content',categoryConfirmed:true});
element('content-area').scrollTop = 450; element('bottom-tabs-bar').scrollLeft = 600;
ctx.state.seriesReturnNavigation = ctx.captureCatalogNavigation();
ctx.state.channels = [{}]; ctx.state.currentSeries = {}; ctx.state.activeSeriesEpisodes = [{}];
ctx.renderChannels = () => { element('content-area').scrollTop = 0; };
ctx.renderTabs = () => {};
let scrollRequested;
ctx.updateMainFocus = scroll => { scrollRequested = scroll; };
ctx.updateSearchVisibility = () => {};
ctx.closeSeriesDetail();
assert.equal(ctx.state.tileIdx,7); assert.equal(ctx.state.currentPage,3);
assert.equal(element('content-area').scrollTop,450); assert.equal(element('bottom-tabs-bar').scrollLeft,600);
assert.equal(scrollRequested,false); assert.equal(ctx.state.currentSeries,null);
assert.equal(ctx.state.activeSeriesEpisodes,null);

load('playSeriesEpisode');
const ep = {season:2,episode:4,url:'episode.mkv'};
const series = {id:'anime',seasonKeys:[1,2],seasons:{2:[{},ep]},episodes:[{}, {}, ep]};
ctx.saveSeriesProgress = () => {}; ctx.playItem = () => {};
ctx.playSeriesEpisode(series,ep);
assert.equal(ctx.state.seriesSelectedSeason,2); assert.equal(ctx.state.seriesEpIdx,1);
assert.equal(ctx.state.seriesArea,'episodes');
// Returning from a category must keep the selected home category and horizontal position.
ctx.state.currentPlaylist = null;
Object.assign(ctx.state,{screen:'playlists',tabIdx:9,tileIdx:0,currentPage:0,currentGroup:'__all',currentFocusArea:'tabs',categoryConfirmed:false});
element('bottom-tabs-bar').scrollLeft = 720;
ctx.state.homeReturnNavigation = ctx.captureCatalogNavigation();
Object.assign(ctx.state,{currentPlaylist:{id:'anime'},tabIdx:0,groups:['Boruto'],searchQuery:''});
ctx.clearTimeout = () => {};
ctx.renderPlaylistsView = () => {ctx.state.tabIdx = 0;};
load('goBackAction'); ctx.goBackAction();
assert.equal(ctx.state.currentPlaylist,null); assert.equal(ctx.state.tabIdx,9);
assert.equal(element('bottom-tabs-bar').scrollLeft,720);
load('cycleOption');
ctx.state.auth.clockMode = 'manual'; ctx.cycleOption(11,1);
assert.equal(ctx.state.auth.clockMode,'auto');
ctx.cycleOption(11,1); assert.equal(ctx.state.auth.clockMode,'manual');
ctx.cycleOption(13,1); assert.equal(ctx.state.auth.clockFormat,'12');
assert.ok(!html.includes('data-action="m3uurl"'));
console.log('Client experience: clock validation, persistence, Spanish formats, VOD states and series return pass.');
