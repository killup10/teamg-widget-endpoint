const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('ott/index.html','utf8');
let area={clientWidth:1280,clientHeight:540,style:{},children:[]};
const ctx={$:()=>area,state:{auth:{}}};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function getTileDimensions()'),html.indexOf('function layoutCatalogViewport()')),ctx);
for(const [width,height] of [[1280,567],[1920,851],[1366,605],[1024,648],[1280,613]]){
 area.clientWidth=width;area.clientHeight=height;
 const d=ctx.getTileDimensions();
 assert.ok(6*(d.tileW+d.gap)+2*d.gap<=width,'Six columns fit including margins and padding');
 assert.ok(3*(d.tileH+d.gap)+2*d.gap<=height,'Three rows fit including margins and padding');
 assert.equal(d.thumbH+d.titleH+8,d.tileH,'Image and title fit inside the focus border');
 const thumb={style:{}},title={style:{}};
 area.children=[{className:'tile-item',style:{},querySelector:s=>s==='.tile-thumb'?thumb:title}];
 ctx.layoutCatalogTiles();assert.equal(area.children[0].style.height,d.tileH+'px');assert.equal(title.style.height,d.titleH+'px');
}
console.log('Catalog layout: six columns, three complete rows, focus borders and resize dimensions pass.');
