// One cancellable worker per move. A terminated or superseded job cannot commit.
export class BotController {
  constructor(createWorker=()=>new Worker(new URL('./strategy-worker.mjs',import.meta.url),{type:'module'})) {
    this.createWorker=createWorker;this.generation=0;this.worker=null;this.watchdog=null;
  }
  cancel() {
    this.generation++;clearTimeout(this.watchdog);this.watchdog=null;
    this.worker?.terminate();this.worker=null;
  }
  start(payload,onResult,onError) {
    this.cancel();const generation=this.generation;
    let worker;
    try {worker=this.createWorker();this.worker=worker;} catch(error) {onError(error.message);return;}
    const finish=(callback,value)=>{
      if(this.generation!==generation||this.worker!==worker)return;
      this.cancel();callback(value);
    };
    worker.onmessage=({data})=>{
      if(data.id!==payload.id)return;
      if(data.error)finish(onError,data.error);else finish(onResult,data.result);
    };
    worker.onerror=()=>finish(onError,'策略引擎未能完成計算，請按「繼續」重試。');
    this.watchdog=setTimeout(()=>finish(onError,'這步計算逾時，請按「繼續」重試。'),6000);
    worker.postMessage(payload);
  }
}
