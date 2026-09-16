import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from './engine.mjs';
import { makeRecord, restoreRecord, reviewPosition, RecordStore } from './records.mjs';
function sample() {
  const match = new Match('blue');
  match.move({from:'d4',to:'e5',actor:'human',gameId:match.id,expectedRevision:0});
  match.move({from:'f6',to:'f5',actor:'agent',gameId:match.id,expectedRevision:1});
  match.undo(); return match;
}
test('round-trip preserves undo branch and review never mutates the active game',()=>{
  const match=sample(),before=match.snapshot(),record=makeRecord(match,'hard','對局');
  const {match:restored}=restoreRecord(record);
  assert.notEqual(restored.id,match.id);
  assert.equal(restored.cursor,1);assert.equal(restored.timeline.length,3);
  assert.deepEqual(restored.position,match.position);
  const review=reviewPosition(record,2);
  assert.equal(review.isRedoBranch,true);assert.equal(review.ply,2);assert.equal(review.turn,'blue');
  assert.equal(reviewPosition(record,0).history.length,0);
  assert.deepEqual(match.snapshot(),before);
  assert.throws(()=>reviewPosition(record,3));assert.throws(()=>reviewPosition(record,-1));
});
test('reject malformed and illegal imported moves; ignore forged board',()=>{
  const record=makeRecord(sample(),'easy','valid');
  assert.throws(()=>restoreRecord({...record,cursor:99}));
  assert.throws(()=>restoreRecord({...record,humanSide:'green'}));
  assert.throws(()=>restoreRecord({...record,moves:[{from:'d4',to:'i9'}],cursor:1}));
  assert.deepEqual(restoreRecord({...record,board:{},result:{winner:'blue'}}).match.position,restoreRecord(record).match.position);
  const legacy={format:'intransitive-practice-v1',...sample().snapshot()};
  assert.equal(restoreRecord(legacy).match.cursor,1);
});
test('durable store creates independent snapshots, imports safely and surfaces storage errors',()=>{
  const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  const store=new RecordStore(storage),record=makeRecord(sample(),'medium','saved');
  const a=store.save(record),b=store.save(record);
  assert.notEqual(a.id,b.id);assert.equal(new RecordStore(storage).list().length,2);
  assert.equal(store.get(a.id).name,'saved');assert.throws(()=>store.get('missing'));
  const imported=store.import(JSON.stringify(record));assert.equal(imported.cursor,1);
  assert.throws(()=>store.import('{'));assert.equal(store.list().length,3);
  const key=[...memory.keys()][0];memory.set(key,'broken');
  assert.throws(()=>store.save(record));assert.equal(memory.get(key),'broken');
  assert.throws(()=>new RecordStore({getItem:()=>null,setItem(){throw new Error('quota');}}).save(record),/quota/);
});
