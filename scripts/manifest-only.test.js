const http=require('node:http'),assert=require('node:assert/strict');
const {handleStream}=require('../ott-api');
function listen(server){return new Promise(r=>server.listen(0,'127.0.0.1',r));}
function get(url){return new Promise((resolve,reject)=>{http.get(url,res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve(body));}).on('error',reject);});}
(async()=>{
 const upstream=http.createServer((req,res)=>{
   if(req.url==='/redirect'){res.writeHead(302,{Location:'/master.m3u8'});return res.end();}
   res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'});
   res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\nsource/chunks.m3u8?signature=keep\n');
 });
 const proxy=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');handleStream(req,res,Object.fromEntries(u.searchParams));});
 try{
  await listen(upstream);await listen(proxy);
  const origin='http://127.0.0.1:'+upstream.address().port;
  const app='http://127.0.0.1:'+proxy.address().port;
  const body=await get(app+'/?manifestOnly=1&url='+encodeURIComponent(origin+'/redirect'));
  assert.ok(body.includes(origin+'/source/chunks.m3u8?signature=keep'));
  assert.ok(!body.includes('/api/ott/stream'));
  const regular=await get(app+'/?url='+encodeURIComponent(origin+'/master.m3u8'));
  assert.ok(regular.includes('/api/ott/stream.m3u8?url='));
  console.log('Manifest-only fetch follows redirects and keeps signed video URLs direct.');
 } finally{proxy.close();upstream.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
