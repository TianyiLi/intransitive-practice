import { chooseMove } from './strategy.mjs';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id, result:chooseMove(data.position,data.difficulty,{historyKeys:data.historyKeys})}); }
  catch(error) { self.postMessage({id:data.id,error:error.message}); }
};
