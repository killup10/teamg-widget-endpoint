const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('ott/index.html', 'utf8');
const start = html.indexOf('function handlePlayerNav(kc, eObj)');
const end = html.indexOf('var DRAWER_PAGE_SIZE', start);
assert.ok(start !== -1 && end !== -1, 'player navigation handler must exist');

const state = {
  activeSeriesEpisodes: null,
  currentChannelIdx: 0,
  currentGroup: '__all',
  drawerIdx: 0,
  drawerOpen: false,
  playerHudVisible: false,
  playerArea: 'bottom',
  playerBotIdx: 2,
  playerTopIdx: 0
};
let drawerOpens = 0;

const context = {
  state,
  KEY: {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 461, STOP: 413, PLAY: 415, PAUSE: 19,
    CH_UP: 33, CH_DOWN: 34, CH_UP_LG: 427, CH_DOWN_LG: 428,
    CH_UP_SAMSUNG: 516, CH_DOWN_SAMSUNG: 517
  },
  $: () => null,
  getFilteredChannels: () => [{ name: 'Canal actual' }, { name: 'Otro canal' }],
  isBackKey: () => false,
  isBlueKey: (kc) => kc === 406,
  isYellowKey: () => false,
  isGreenKey: () => false,
  isRedKey: () => false,
  isDrawerVisible: () => false,
  openChannelDrawer: () => { drawerOpens++; },
  showPlayerOverlay: () => { state.playerHudVisible = true; },
  updatePlayerFocus: () => {},
  hidePlayerOverlay: () => { state.playerHudVisible = false; },
  playChannelAt: () => {},
  window: {}
};

vm.createContext(context);
vm.runInContext(html.slice(start, end), context);

// D-pad and color-key presses may reveal the HUD, but must not open the list.
context.handlePlayerNav(context.KEY.DOWN, { key: 'ArrowDown' });
assert.equal(drawerOpens, 0, 'ArrowDown must not open the channel list');
assert.equal(state.playerHudVisible, true, 'ArrowDown should reveal the player HUD');
assert.equal(state.playerBotIdx, 0, 'ArrowDown should focus the channel-list button');

state.playerHudVisible = false;
context.handlePlayerNav(406, { key: 'Blue' });
assert.equal(drawerOpens, 0, 'the blue key must not directly open the channel list');
assert.equal(state.playerHudVisible, true, 'a color key should only reveal the player HUD');

state.playerHudVisible = false;
context.handlePlayerNav(context.KEY.ENTER, { key: 'Enter' });
assert.equal(drawerOpens, 0, 'Enter before focusing the channel-list button must not open it');
assert.equal(state.playerHudVisible, true, 'Enter should first reveal the player HUD');

// Opening by remote is allowed after explicitly focusing and activating its button.
state.playerArea = 'bottom';
state.playerBotIdx = 0;
context.handlePlayerNav(context.KEY.ENTER, { key: 'Enter' });
assert.equal(drawerOpens, 1, 'Enter on the focused channel-list button should open it');

console.log('Player drawer activation tests pass successfully.');
