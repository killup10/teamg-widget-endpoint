const assert = require('node:assert/strict');
const {toVtt} = require('../subtitle-utils');
process.env.MONGODB_URI=''; process.env.ADMIN_KEY='subtitle-test';
const {handle}=require('../ott-api');
const srt='1\r\n00:00:01,000 --> 00:00:02,000\r\nHola\r\n';
assert.match(toVtt(srt),/^WEBVTT\n\n/);
assert.match(toVtt(srt),/00:00:01.000/);
assert.throws(()=>toVtt('Not a subtitle'));
assert.throws(()=>toVtt('x'.repeat(2097153)));
async function call(path,method,body={},query={}) {
  let code,raw,headers;
  await handle({method,headers:{host:'ott.teamg.store','x-admin-key':'subtitle-test'}},{
    writeHead(c,h){code=c;headers=h;},end(text){raw=text;}
  },path,query,body);
  return {code,raw,headers};
}
(async()=>{
  const uploaded=await call('/api/ott/admin/upload-subtitle','POST',{text:srt});
  assert.equal(uploaded.code,200);
  const url=JSON.parse(uploaded.raw).url;
  const read=await call(new URL(url).pathname,'GET');
  assert.equal(read.code,200); assert.match(read.headers['Content-Type'],/text\/vtt/);
  assert.equal(read.raw,toVtt(srt));
  const repeat=await call('/api/ott/admin/upload-subtitle','POST',{text:srt});
  assert.equal(JSON.parse(repeat.raw).url,url);
  const mkv=await call('/api/ott/subtitles','GET',{}, {url:'https://example/movie.mkv',track:'2'});
  assert.equal(mkv.code,422); // Never download a movie to extract subtitles at playback time.
  console.log('Persistent shared subtitles, conversion, deduplication, limits and MKV protection pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
