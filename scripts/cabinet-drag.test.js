const assert = require('assert');
const fs = require('fs');
const path = require('path');

const cabinetHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'cabinet.html'), 'utf8');

// 1. Verify no duplicate ondrop loop overwrites group drag
assert(!cabinetHtml.includes('// Arrastrar canal hacia un grupo de la barra lateral'), 'Redundant overwriting group drag loop should be removed');
assert(cabinetHtml.includes('dragGroupItems[i].ondrop'), 'Unified group ondrop handler must be present');
assert(cabinetHtml.includes('drag-over-top') && cabinetHtml.includes('drag-over-bottom'), 'Top/bottom drop indicators must be present for groups');
assert(cabinetHtml.includes('container.scrollTop'), 'Auto-scroll for groups list must be present');

// 2. Test reordering simulation logic
function simulateGroupDrop(groups, srcGroup, targetGroup, wasOverTop) {
  const list = [...groups];
  const fromIdx = list.indexOf(srcGroup);
  const toIdx = list.indexOf(targetGroup);
  if (fromIdx > -1 && toIdx > -1) {
    list.splice(fromIdx, 1);
    const newToIdx = list.indexOf(targetGroup);
    const insertIdx = wasOverTop ? newToIdx : newToIdx + 1;
    list.splice(insertIdx, 0, srcGroup);
  }
  return list;
}

const initialGroups = ['Serie A', 'Serie B', 'Serie C', 'Serie D', 'Serie E'];

// Move Serie A below Serie C
let reordered = simulateGroupDrop(initialGroups, 'Serie A', 'Serie C', false);
assert.deepStrictEqual(reordered, ['Serie B', 'Serie C', 'Serie A', 'Serie D', 'Serie E']);

// Move Serie E above Serie B
reordered = simulateGroupDrop(initialGroups, 'Serie E', 'Serie B', true);
assert.deepStrictEqual(reordered, ['Serie A', 'Serie E', 'Serie B', 'Serie C', 'Serie D']);

// Move Serie D to the very top (above Serie A)
reordered = simulateGroupDrop(initialGroups, 'Serie D', 'Serie A', true);
assert.deepStrictEqual(reordered, ['Serie D', 'Serie A', 'Serie B', 'Serie C', 'Serie E']);

// Move Serie A to the very bottom (below Serie E)
reordered = simulateGroupDrop(initialGroups, 'Serie A', 'Serie E', false);
assert.deepStrictEqual(reordered, ['Serie B', 'Serie C', 'Serie D', 'Serie E', 'Serie A']);

// 3. Test reorderChannelsByGroupOrder simulation
function reorderChannelsByGroupOrder(channels, groups) {
  const order = {};
  groups.forEach((g, idx) => { order[g] = idx; });
  const indexed = channels.map((c, i) => {
    const gOrder = Object.prototype.hasOwnProperty.call(order, c.group) ? order[c.group] : 999999;
    return { c, gOrder, origIdx: i };
  });
  indexed.sort((a, b) => {
    if (a.gOrder !== b.gOrder) return a.gOrder - b.gOrder;
    return a.origIdx - b.origIdx;
  });
  return indexed.map(x => x.c);
}

const channels = [
  { name: 'Ep 1', group: 'Serie A' },
  { name: 'Ep 2', group: 'Serie A' },
  { name: 'Ep 1', group: 'Serie B' },
  { name: 'Ep 1', group: 'Serie C' }
];

const newGroups = ['Serie B', 'Serie C', 'Serie A'];
const sortedChannels = reorderChannelsByGroupOrder(channels, newGroups);
assert.strictEqual(sortedChannels[0].group, 'Serie B');
assert.strictEqual(sortedChannels[1].group, 'Serie C');
assert.strictEqual(sortedChannels[2].group, 'Serie A');
assert.strictEqual(sortedChannels[3].group, 'Serie A');

console.log('Cabinet group drag and drop reordering tests pass successfully.');
