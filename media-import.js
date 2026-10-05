'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
function publicAddress(address) {
  if (net.isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address);
  const p = address.split('.').map(Number);
  return net.isIP(address) === 4 && p[0] > 0 && p[0] < 224 &&
    p[0] !== 10 && p[0] !== 127 && !(p[0] === 169 && p[1] === 254) &&
    !(p[0] === 172 && p[1] >= 16 && p[1] <= 31) && !(p[0] === 192 && p[1] === 168) &&
    !(p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}
async function publicBuffer(raw, maximum, redirects=3) {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('Enlace de archivo inválido.');
  const records = await dns.lookup(url.hostname, {all:true});
  if (!records.length || records.some(r=>!publicAddress(r.address))) throw new Error('El enlace debe ser público.');
  const record = records[0];
  return new Promise((resolve,reject)=>{
    let settled=false, response;
    const finish=(err,data)=>{if(settled)return;settled=true;clearTimeout(timer); if(err){if(response)response.destroy();req.destroy();reject(err);}else resolve(data);};
    const req = require(url.protocol === 'https:' ? 'node:https' : 'node:http').get(url, {
      family:record.family, lookup:(_host,_opts,cb)=>cb(null,record.address,record.family),
      headers:{'User-Agent':'TeamG-Play/1.0','Accept-Encoding':'identity'}
    }, res=>{
      response=res;
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        const next=new URL(res.headers.location,url).href;
        res.destroy();
        if (!redirects) return finish(new Error('Demasiadas redirecciones.'));
        finish(null,publicBuffer(next,maximum,redirects-1)); return;
      }
      if(res.statusCode!==200)return finish(new Error('El enlace respondió HTTP '+res.statusCode));
      if(Number(res.headers['content-length'])>maximum)return finish(new Error('Archivo demasiado grande.'));
      const chunks=[];let size=0;
      res.on('data',part=>{size+=part.length;if(size>maximum)return finish(new Error('Archivo demasiado grande.'));chunks.push(part);});
      res.on('error',err=>finish(err)); res.on('end',()=>finish(null,Buffer.concat(chunks)));
    });
    const timer=setTimeout(()=>finish(new Error('El enlace tardó demasiado en responder.')),12000);
    req.on('error',err=>finish(err));
  });
}
let imageBusy=false;
async function prepareImage(body) {
  if(imageBusy) throw new Error('Hay otra imagen en proceso. Intenta de nuevo en unos segundos.');
  imageBusy=true;
  try {
    let bytes;
    if(body.url) bytes=await publicBuffer(String(body.url).replace(/&amp;/g,'&'),4*1024*1024);
    else {
      const data=String(body.data || '');
      if(data.length>6*1024*1024 || !/^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+=*$/.test(data))throw new Error('Imagen inválida o demasiado grande.');
      bytes=Buffer.from(data.split(',')[1],'base64');
      if(bytes.length>4*1024*1024)throw new Error('Imagen demasiado grande.');
    }
    const sharp=require('sharp');
    sharp.cache(false);sharp.concurrency(1);
    const vertical=body.shape==='vertical';
    return await sharp(bytes,{limitInputPixels:16000000}).rotate()
      .resize(vertical?300:400,vertical?450:225,{fit:'contain',background:'#160e18'})
      .flatten({background:'#160e18'}).jpeg({quality:80,progressive:false}).toBuffer();
  } finally {imageBusy=false;}
}
module.exports={publicAddress,publicBuffer,prepareImage};
