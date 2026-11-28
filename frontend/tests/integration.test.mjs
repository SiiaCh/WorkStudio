import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
Object.defineProperty(globalThis,'localStorage',{value:storage(),configurable:true});
async function load(file){const code=ts.transpileModule(fs.readFileSync(new URL('../src/services/'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {createApiClient}=await load('api.ts');
const {mapTariff,tariffPayload,tariffListPath}=await load('tariffs.ts');
const {facilityNow}=await load('facility.ts');
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('tariff responses without unit map and create/update use supported fields only',async()=>{
 const t=mapTariff({id:'standard',name:'Standard',price:'150.00',version:2});
 assert.equal(t.price,150);assert.deepEqual(tariffPayload({...t,unit:'HOUR',description:'unsupported'}),{name:'Standard',price:150});
 const c=createApiClient('https://api.example/api',storage(),async(url,options)=>{assert.equal(url,'https://api.example/api/admin/tariffs');assert.deepEqual(JSON.parse(options.body),{name:'Standard',price:150});return json(201,{data:{tariff:t}});},()=>{});
 assert.equal((await c.apiRequest('/admin/tariffs',{method:'POST',body:JSON.stringify(tariffPayload(t))})).tariff.name,'Standard');
 assert.equal(tariffListPath('ADMINISTRATOR'),'/admin/tariffs');assert.equal(tariffListPath('CLIENT'),'/tariffs');
});
test('login envelope, persisted token restoration, admin listing and logout',async()=>{
 const saved=storage();let next=0;const fake=async(url,options)=>{next++;if(next===1){assert.ok(url.endsWith('/auth/login'));return json(200,{data:{accessToken:'test-token',user:{role:'ADMINISTRATOR'}}});}assert.equal(options.headers.get('Authorization'),'Bearer test-token');if(next===2)return json(200,{data:{tariffs:[{id:'1',name:'Standard',price:'150.00',version:1}]}});assert.ok(url.endsWith('/auth/logout'));return json(200,{data:{message:'Signed out'}});};
 const c=createApiClient('https://api.example/api',saved,fake,()=>{});const login=await c.apiRequest('/auth/login',{method:'POST',body:'{}'});c.setAccessToken(login.accessToken);
 const restored=createApiClient('https://api.example/api',saved,fake,()=>{});assert.equal((await restored.apiRequest('/admin/tariffs')).tariffs.map(mapTariff).length,1);await restored.apiRequest('/auth/logout',{method:'POST',body:'{}'});restored.setAccessToken(null);assert.equal(saved.getItem('ws-access-token'),null);
});
test('protected 401 clears session once and identifies endpoint without exposing token',async()=>{
 let expired=0;const saved=storage();saved.setItem('ws-access-token','private-test-token');const c=createApiClient('',saved,async()=>json(401,{error:{code:'UNAUTHENTICATED',message:'Sign in again'}}),()=>expired++);
 await assert.rejects(c.apiRequest('/admin/tariffs'),e=>e.status===401&&e.path==='/admin/tariffs'&&!e.message.includes('private-test-token'));assert.equal(c.getAccessToken(),null);assert.equal(expired,1);
});
test('403, failed login and network failure do not destroy an active session',async()=>{
 for(const scenario of ['forbidden','login','network']){let expired=0;const c=createApiClient('',storage(),async()=>{if(scenario==='network')throw Error('Offline');return json(scenario==='login'?401:403,{error:{message:'Denied'}});},()=>expired++);c.setAccessToken('active-token');await assert.rejects(c.apiRequest(scenario==='login'?'/auth/login':'/admin/tariffs'));assert.equal(c.getAccessToken(),'active-token');assert.equal(expired,0);}
});
test('stale 401 never invalidates a newly established session; stale success is discarded',async()=>{
 for(const status of [200,401]){let finish;let expired=0;const c=createApiClient('',storage(),()=>new Promise(r=>finish=r),()=>expired++);c.setAccessToken('old-token');const pending=c.apiRequest('/auth/me');c.setAccessToken('new-token');finish(json(status,{data:{user:{id:'old-user'}}}));await assert.rejects(pending);assert.equal(c.getAccessToken(),'new-token');assert.equal(expired,0);}
});
test('validation errors retain field details and malformed stored tokens are not sent',async()=>{
 const saved=storage();saved.setItem('ws-access-token','undefined');const c=createApiClient('',saved,async(url,o)=>{assert.equal(o.headers.get('Authorization'),null);return json(400,{error:{message:'Check the submitted fields.',details:[{field:'price',message:'Price must be positive.'}]}});},()=>{});await assert.rejects(c.apiRequest('/admin/tariffs',{method:'POST',body:'{}'}),/price: Price must be positive/);
});
test('facility date uses Kyiv rather than browser timezone and follows DST',()=>{
 assert.deepEqual(facilityNow(new Date('2027-01-01T22:30:00Z')),{date:'2027-01-02',time:'00:30'});
 assert.equal(facilityNow(new Date('2027-06-01T06:00:00Z')).time,'09:00');
});

const {checkoutKey}=await load('payments.ts');
test('uncertain LiqPay retries reuse a key; a newly failed attempt rotates it only once',()=>{
 const saved=storage();const first=checkoutKey(saved,'booking');assert.equal(checkoutKey(saved,'booking'),first);
 const retry=checkoutKey(saved,'booking','failed-1');assert.notEqual(retry,first);assert.equal(checkoutKey(saved,'booking','failed-1'),retry);assert.equal(checkoutKey(saved,'booking'),retry);
 assert.notEqual(checkoutKey(saved,'booking','failed-2'),retry);
});
