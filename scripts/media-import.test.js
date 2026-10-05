const assert=require('node:assert/strict');
const sharp=require('sharp');
const {prepareImage,publicAddress}=require('../media-import');
const fs=require('node:fs'),vm=require('node:vm');
for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.2','172.17.0.1','::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
assert.equal(publicAddress('8.8.8.8'),true);
const api=fs.readFileSync('ott-api.js','utf8');
const context={};vm.createContext(context);
vm.runInContext(api.slice(api.indexOf('function mergePlaylistSource('),api.indexOf('function serializeChannelsToM3u(')),context);
const existing=[{name:'T1 E1',group:'Serie',url:'https://example/1',seriesLogo:'https://example/h.jpg'},
  {name:'T1 E2',group:'Serie',url:'https://example/2',seriesPoster:'https://example/v.jpg'}];
const merged=context.mergePlaylistSource(existing,[{name:'T1 E2',group:'Serie',url:'https://example/2'},{name:'T1 E3',group:'Serie',url:'https://example/3',seriesPoster:'https://source/new.jpg'}]);
assert.equal(merged.channels[1].seriesLogo,'https://example/h.jpg');
assert.equal(merged.channels[2].seriesLogo,'https://example/h.jpg');
assert.equal(merged.channels[2].seriesPoster,'https://example/v.jpg');
assert.equal(merged.added,1);
const sourceOnly=context.mergePlaylistSource([], [{name:'E1',group:'Nueva',url:'https://example/new',seriesLogo:'https://example/source.jpg'}]);
assert.equal(sourceOnly.channels[0].seriesLogo,'https://example/source.jpg');
(async()=>{
  const input=await sharp({create:{width:800,height:800,channels:3,background:'#ff0000'}}).webp().toBuffer();
  const data='data:image/webp;base64,'+input.toString('base64');
  const horizontal=await prepareImage({data,shape:'horizontal'});
  const h=await sharp(horizontal).metadata();assert.equal(h.format,'jpeg');assert.equal(h.width,400);assert.equal(h.height,225);
  const vertical=await prepareImage({data,shape:'vertical'});
  const v=await sharp(vertical).metadata();assert.equal(v.width,300);assert.equal(v.height,450);
  assert.equal(h.isProgressive,false);
  await assert.rejects(prepareImage({data:'data:image/png;base64,YmFk'}));
  console.log('Artwork inheritance and WebP-to-baseline-JPEG preparation with horizontal/vertical proportions pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
