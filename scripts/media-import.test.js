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
const tv=fs.readFileSync('ott/index.html','utf8');
const tvContext={API_BASE:'http://ott.teamg.store',state:{},$:()=>({style:{}})};
vm.createContext(tvContext);
vm.runInContext(tv.slice(tv.indexOf('function resolveIconUrl('),tv.indexOf('function fitTvImage(')),tvContext);
vm.runInContext(tv.slice(tv.indexOf('function probeSubtitles('),tv.indexOf('function playChannelAt(')),tvContext);
assert.equal(tvContext.resolveIconUrl('https://backend.onrender.com/api/ott/subtitle/id.vtt'),'http://ott.teamg.store/api/ott/subtitle/id.vtt');
assert.match(tvContext.resolveIconUrl('https://disney.images.edge.bamgrid.com/test?format=webp&amp;width=1200'),/format=jpeg&width=400/);
tvContext.probeSubtitles('https://example/movie.mkv','https://backend.onrender.com/api/ott/subtitle/id.vtt');
assert.equal(tvContext.state.activeSubTracks[0].url,'http://ott.teamg.store/api/ott/subtitle/id.vtt');
tvContext.probeSubtitles('https://example/movie.mkv','');
assert.equal(tvContext.state.activeSubTracks.length,0); // No server movie probe.
(async()=>{
  const input=await sharp({create:{width:800,height:800,channels:3,background:'#ff0000'}}).webp().toBuffer();
  const data='data:image/webp;base64,'+input.toString('base64');
  const horizontal=await prepareImage({data,shape:'horizontal'});
  const h=await sharp(horizontal).metadata();assert.equal(h.format,'jpeg');assert.equal(h.width,400);assert.equal(h.height,225);
  const vertical=await prepareImage({data,shape:'vertical'});
  const v=await sharp(vertical).metadata();assert.equal(v.width,300);assert.equal(v.height,450);
  assert.equal(h.isProgressive,false);
  await assert.rejects(prepareImage({data:'data:image/png;base64,YmFk'}));

  // Check IPv4 priority and browser User-Agent in media-import.js
  const mediaCode = fs.readFileSync('media-import.js', 'utf8');
  assert.ok(mediaCode.includes('records.find(r => r.family === 4) || records[0]'), 'publicBuffer must prioritize IPv4 to avoid ENETUNREACH on IPv4-only cloud hosts');
  assert.ok(mediaCode.includes('Chrome/122.0.0.0'), 'publicBuffer must use modern browser User-Agent to avoid 403 on Amazon/CloudFront CDNs');

  // Check cabinet.html error detail extraction
  const cabCode = fs.readFileSync('web/cabinet.html', 'utf8');
  assert.ok(cabCode.includes('throw new Error(d && d.error ? d.error : ("HTTP " + r.status));'), 'cabinet.html must extract error message from API response');

  console.log('Artwork inheritance, WebP-to-baseline-JPEG, IPv4 priority, and browser User-Agent pass successfully.');
})().catch(e=>{console.error(e);process.exitCode=1;});
