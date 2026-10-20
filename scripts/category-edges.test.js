const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('ott/index.html','utf8');
const bar={style:{},scrollLeft:0,clientWidth:1032,scrollWidth:2400,children:Array.from({length:12},(_,i)=>({style:{},offsetLeft:i*200,offsetWidth:200}))};
const left={style:{}},right={style:{}},timers=new Map();let id=0;
const ctx={state:{tabIdx:0},$:name=>name==='bottom-tabs-bar'?bar:name==='tabs-edge-left'?left:right,
 setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:n=>timers.delete(n),
 switchCategoryTab:dir=>{ctx.state.tabIdx+=dir},updateMainFocus:()=>{}};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function stopTabEdgeScroll()'),html.indexOf('function renderTabs()')),ctx);
ctx.syncTabEdges();assert.equal(bar.children[0].style.width,undefined);assert.deepEqual(bar.style,{});
assert.equal(left.style.display,'none');assert.equal(right.style.display,'block');
right.onmouseenter();assert.equal(bar.scrollLeft,184);assert.equal(ctx.state.tabIdx,5);assert.equal(left.style.display,'block');
let pending=timers.get(ctx.state._tabEdgeTimer);timers.delete(ctx.state._tabEdgeTimer);pending();
assert.equal(bar.scrollLeft,384);assert.equal(ctx.state.tabIdx,6);
right.onmouseleave();assert.equal(ctx.state._tabEdgeDirection,0);assert.equal(timers.size,0);
left.onmouseenter();assert.equal(bar.scrollLeft,184);assert.equal(ctx.state.tabIdx,1);left.onmouseleave();
bar.children[3].onmouseenter();assert.equal(ctx.state.tabIdx,3);
bar.scrollLeft=1368;ctx.syncTabEdges();assert.equal(right.style.display,'none');assert.equal(left.style.display,'block');
bar.style.display='none';ctx.syncTabEdges();assert.equal(left.style.display,'none');assert.equal(right.style.display,'none');
bar.style.display='';bar.children=bar.children.slice(0,4);bar.scrollWidth=800;bar.scrollLeft=0;ctx.syncTabEdges();assert.equal(right.style.display,'none');
assert.ok(!html.includes('Más categorías">&#8250;'));
console.log('OTT tabs: original sizes preserved, blank edges, repeated hover with selection, stop on leave, reverse and boundaries pass.');
