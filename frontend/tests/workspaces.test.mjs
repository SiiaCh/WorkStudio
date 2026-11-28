import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
async function load(file){const code=ts.transpileModule(fs.readFileSync(new URL('../src/services/'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const s=await load('workspaces.ts');
const api=(o={})=>({id:'w1',name:'Desk 1',type:'Desk',location:'Zone A',description:'d',status:'FREE',version:3,mapPosition:{x:0.25,y:0.5},...o});

test('mapWorkspace maps statuses and map position, tolerates missing/invalid position',()=>{
  assert.equal(s.mapWorkspace(api()).status,'Available');
  assert.equal(s.mapWorkspace(api({status:'OCCUPIED'})).status,'Occupied');
  assert.equal(s.mapWorkspace(api({status:'UNAVAILABLE'})).status,'Unavailable');
  assert.deepEqual(s.mapWorkspace(api()).mapPosition,{x:0.25,y:0.5});
  assert.equal(s.mapWorkspace(api({mapPosition:null})).mapPosition,null);
  assert.equal(s.mapWorkspace(api({mapPosition:undefined})).mapPosition,null);
  assert.equal(s.mapWorkspace(api({mapPosition:{x:'a',y:1}})).mapPosition,null);
  assert.deepEqual(s.mapWorkspace(api({mapPosition:{x:2,y:-1}})).mapPosition,{x:1,y:0});
});
test('pointToPosition normalizes and clamps clicks',()=>{
  const rect={left:100,top:50,width:400,height:300};
  assert.deepEqual(s.pointToPosition(300,200,rect),{x:0.5,y:0.5});
  assert.deepEqual(s.pointToPosition(0,0,rect),{x:0,y:0});
  assert.deepEqual(s.pointToPosition(9999,9999,rect),{x:1,y:1});
  assert.equal(s.pointToPosition(1,1,{left:0,top:0,width:0,height:0}),null);
});
test('placed/unplaced, counts, filter and overlap spreading',()=>{
  const list=[s.mapWorkspace(api()),s.mapWorkspace(api({id:'w2',name:'Room',type:'Meeting',status:'OCCUPIED',mapPosition:null})),s.mapWorkspace(api({id:'w3',name:'Desk 3',status:'UNAVAILABLE'}))];
  assert.equal(s.placedWorkspaces(list).length,2);assert.equal(s.unplacedWorkspaces(list)[0].id,'w2');
  assert.deepEqual(s.countByStatus(list),{Available:1,Occupied:1,Unavailable:1});
  assert.deepEqual(s.filterWorkspaces(list,'desk','all').map(w=>w.id),['w1','w3']);
  assert.deepEqual(s.filterWorkspaces(list,'','Occupied').map(w=>w.id),['w2']);
  const spread=s.spreadOverlaps(list);assert.notDeepEqual(spread.get('w1'),spread.get('w3'));assert.ok(!spread.has('w2'));
});
test('resolutions must cover every affected booking exactly once',()=>{
  const affected=[{booking:{id:'b1'},alternatives:[]},{booking:{id:'b2'},alternatives:[api({id:'w9'})]}];
  assert.deepEqual(s.unresolvedIds(affected,{}),['b1','b2']);
  const d={b1:{bookingId:'b1',action:'CANCEL'},b2:{bookingId:'b2',action:'REASSIGN',workspaceId:''}};
  assert.deepEqual(s.unresolvedIds(affected,d),['b2']);
  d.b2.workspaceId='w9';assert.deepEqual(s.unresolvedIds(affected,d),[]);
  assert.deepEqual(s.buildResolutions(affected,d),[{bookingId:'b1',action:'CANCEL'},{bookingId:'b2',action:'REASSIGN',workspaceId:'w9'}]);
});
test('changeStatus sends version, idempotency key and, for UNAVAILABLE, confirm + resolutions',async()=>{
  const calls=[];const request=async(path,o)=>{calls.push({path,o});return {workspace:api({status:'UNAVAILABLE',version:4})};};
  const w=s.mapWorkspace(api());
  const out=await s.changeStatus(request,{workspace:w,version:3,status:'Unavailable',resolutions:[{bookingId:'b1',action:'CANCEL'}],idempotencyKey:'k1'});
  assert.equal(out.status,'Unavailable');assert.equal(out.version,4);
  assert.equal(calls[0].path,'/admin/workspaces/w1/status');assert.equal(calls[0].o.method,'PATCH');assert.equal(calls[0].o.headers['Idempotency-Key'],'k1');
  assert.deepEqual(JSON.parse(calls[0].o.body),{version:3,status:'UNAVAILABLE',confirm:true,resolutions:[{bookingId:'b1',action:'CANCEL'}]});
  await s.changeStatus(request,{workspace:w,version:3,status:'Occupied',idempotencyKey:'k2'});
  assert.deepEqual(JSON.parse(calls[1].o.body),{version:3,status:'OCCUPIED'});
});
test('fetchAffectedBookings and savePosition use the documented endpoints',async()=>{
  const calls=[];const request=async(path,o)=>{calls.push({path,o});return path.includes('affected')?{affectedBookings:[{booking:{id:'b1'},alternatives:[]}]}:{workspace:api({version:4,mapPosition:{x:0.1235,y:0.9}})};};
  assert.equal((await s.fetchAffectedBookings(request,'w1')).length,1);assert.equal(calls[0].path,'/admin/workspaces/w1/affected-bookings');
  const w=s.mapWorkspace(api());const r=await s.savePosition(request,w,{x:0.123456,y:0.9},'k3');
  assert.deepEqual(JSON.parse(calls[1].o.body),{version:3,mapPosition:{x:0.1235,y:0.9}});assert.equal(calls[1].o.headers['Idempotency-Key'],'k3');assert.equal(r.version,4);
  await s.savePosition(request,w,null,'k4');assert.deepEqual(JSON.parse(calls[2].o.body),{version:3,mapPosition:null});
});
test('describeStatusError maps backend error codes to admin guidance',()=>{
  const e=code=>Object.assign(new Error('x'),{code});
  assert.equal(s.describeStatusError(e('VERSION_CONFLICT')).refresh,true);
  assert.equal(s.describeStatusError(e('UNRESOLVED_BOOKINGS')).refresh,true);
  assert.equal(s.describeStatusError(e('RESOURCE_BUSY')).retrySameKey,true);
  assert.equal(s.describeStatusError(new Error('boom')).message,'boom');
});
