'use strict';
const assert = require('node:assert/strict');
delete process.env.MONGODB_URI;
process.env.ADMIN_KEY = 'ledger-local-test';
const store = require('../ott-store');
const { handle } = require('../ott-api');
const ledger = require('../payment-ledger');
async function call(path, method='GET', body={}, query={}, admin=true) {
 let status, data;
 await handle({method,headers:admin?{'x-admin-key':process.env.ADMIN_KEY}:{}},{writeHead(s){status=s;},end(raw){data=JSON.parse(raw);}},path,query,body);
 return {status,data};
}
(async()=>{
 const cols=await store.init();
 await cols.devices.insertOne({_id:'tv-ledger',name:'TV Sala',note:'Juan',paymentDueDate:'2026-10-21'});
 const payment={id:'a'.repeat(32),planId:'vip-3',date:'2026-10-18',amount:'64.90',description:'Renovación VIP',deviceId:'tv-ledger',method:'Yape'};
 let r=await call('/api/ott/admin/payments','POST',payment,{},false);assert.equal(r.status,403);
 r=await call('/api/ott/admin/payments','POST',payment);assert.equal(r.status,200);
 r=await call('/api/ott/admin/payments','POST',payment);assert.equal(r.data.duplicate,true);
 r=await call('/api/ott/admin/payments','POST',{...payment,amount:'14.90',planId:'standard-1'});assert.equal(r.status,409);
 r=await call('/api/ott/admin/payments','GET',{}, {month:'2026-10'});assert.equal(r.data.incomeCents,6490);assert.equal(r.data.records.length,1);assert.equal(r.data.records[0].clientName,'Juan');assert.equal(r.data.records[0].months,3);assert.equal(r.data.plans.length,8);
 r=await call('/api/ott/admin/payments','POST',{...payment,id:'b'.repeat(32),planId:'standard-1',amount:'14.90'});assert.equal(r.status,200);
 r=await call('/api/ott/admin/payments','GET',{}, {month:'2026-10'});assert.equal(r.data.incomeCents,7980);
 r=await call('/api/ott/admin/payments','POST',{...payment,id:'c'.repeat(32),date:'2026-11-01',planId:'',amount:'0.10'});assert.equal(r.status,200);
 r=await call('/api/ott/admin/payments','GET',{}, {month:'2026-11'});assert.equal(r.data.incomeCents,10);
 for(const bad of [{date:'2026-02-30'},{amount:'1.001'},{amount:'-1'},{amount:'0'},{amount:'1e3'},{planId:'missing'},{amount:'15'},{description:''}]) {
  r=await call('/api/ott/admin/payments','POST',{...payment,id:'d'.repeat(32),...bad});assert.equal(r.status,400,JSON.stringify(bad));
 }
 r=await call('/api/ott/admin/payments/void','POST',{id:payment.id});assert.equal(r.status,200);
 r=await call('/api/ott/admin/payments/void','POST',{id:payment.id});assert.equal(r.status,200);
 r=await call('/api/ott/admin/payments','GET',{}, {month:'2026-10'});assert.equal(r.data.incomeCents,1490);assert.equal(r.data.records.length,2);assert.ok(r.data.records.some(x=>x.voided));
 assert.equal((await cols.devices.findOne({_id:'tv-ledger'})).paymentDueDate,'2026-10-21','Payments must not silently alter device dates');
 assert.equal(ledger.validDate('2028-02-29'),true);
 console.log('Payment plans, monthly cents totals, auth, duplicate protection, validation and void history pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
