import test from 'node:test';
import assert from 'node:assert/strict';
import { BotController } from './bot-controller.mjs';
test('cancelled moves cannot commit after undo, new game or difficulty change',()=>{
  const workers=[],commits=[],errors=[];
  const bot=new BotController(()=>{const w={terminate(){this.terminated=true;},postMessage(data){this.data=data;}};workers.push(w);return w;});
  bot.start({id:'old'},r=>commits.push(r),e=>errors.push(e));
  bot.cancel();workers[0].onmessage({data:{id:'old',result:'late'}});assert.deepEqual(commits,[]);
  bot.start({id:'medium'},r=>commits.push(r),e=>errors.push(e));
  bot.start({id:'hard'},r=>commits.push(r),e=>errors.push(e));
  workers[1].onmessage({data:{id:'medium',result:'old-level'}});
  workers[2].onmessage({data:{id:'wrong',result:'wrong-id'}});assert.deepEqual(commits,[]);
  workers[2].onmessage({data:{id:'hard',result:'legal'}});
  workers[2].onmessage({data:{id:'hard',result:'duplicate'}});
  assert.deepEqual(commits,['legal']);assert.deepEqual(errors,[]);assert.equal(workers[2].terminated,true);
});
test('worker failures are visible and leave no pending worker',()=>{
  let worker,error;
  const bot=new BotController(()=>worker={terminate(){},postMessage(){}});
  bot.start({id:'test'},()=>assert.fail(),e=>error=e);worker.onerror();
  assert.match(error,/重試/);assert.equal(bot.worker,null);
});
