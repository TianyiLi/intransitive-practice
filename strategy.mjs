// Original, bounded game-tree search. Rules are parity-tested against engine.mjs.
export const LEVELS = Object.freeze({
  easy: { label: '簡單', depth: 1, timeMs: 180, noise: 85, qDepth: 0 },
  medium: { label: '中等', depth: 3, timeMs: 650, noise: 0, qDepth: 1 },
  hard: { label: '困難', depth: 5, timeMs: 1600, noise: 0, qDepth: 2, goalDriven: true }
});
const TYPES = { R: 1, P: 2, S: 3 }, BEATS = [0, 3, 1, 2], WIN = 100000;
const neighbors = Array.from({length:81}, (_, i) => {
  const out=[]; for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
    if(!dx&&!dy) continue; const x=i%9+dx,y=Math.floor(i/9)+dy;
    if(x>=0&&x<9&&y>=0&&y<9) out.push(x+y*9);
  } return out;
});
const index = sq => sq.charCodeAt(0)-97+(Number(sq[1])-1)*9;
const square = i => String.fromCharCode(97+i%9)+(Math.floor(i/9)+1);
const distance = (a,b) => Math.max(Math.abs(a%9-b%9),Math.abs(Math.floor(a/9)-Math.floor(b/9)));
function encode(position) {
  const board=new Int8Array(81);
  for(const [sq,p] of Object.entries(position.board)) board[index(sq)]=(p.side==='blue'?1:-1)*TYPES[p.type];
  return board;
}
function moves(board,side) {
  const list=[];
  for(let from=0;from<81;from++) if(board[from]*side>0) for(const to of neighbors[from]) {
    if(!board[to] || (board[to]*side<0 && BEATS[Math.abs(board[from])]===Math.abs(board[to]))) list.push({from,to,capture:board[to]});
  }
  return list;
}
export function searchLegalMoves(position) {
  if(position.result) return [];
  return moves(encode(position),position.turn==='blue'?1:-1).map(m=>({from:square(m.from),to:square(m.to)}));
}
const positionKey = (board,side) => `${side}:`+Array.from(board).join('');
export const strategyPositionKey = position => positionKey(encode(position),position.turn==='blue'?1:-1);
function evaluate(board,side) {
  const count={1:[0,0,0,0],'-1':[0,0,0,0]}, score={1:0,'-1':0}, nearest={1:9,'-1':9};
  for(const p of board) if(p) count[Math.sign(p)][Math.abs(p)]++;
  for(let at=0;at<81;at++) {
    const p=board[at]; if(!p) continue;
    const team=Math.sign(p), type=Math.abs(p), goal=team===1?80:0, dist=distance(at,goal);
    nearest[team]=Math.min(nearest[team],dist);
    let value=100+(8-dist)*2.5;
    // A type becomes harder to stop when its predator disappears.
    const predator=BEATS.indexOf(type);
    if(!count[-team][predator]) value+=35;
    if(count[team][type]===1 && count[-team][BEATS[type]]) value+=12;
    let danger=0, mobility=0;
    for(const next of neighbors[at]) {
      const other=board[next];
      if(!other || (other*team<0 && BEATS[type]===Math.abs(other))) mobility++;
      if(other*team<0 && BEATS[Math.abs(other)]===type) {
        const protectedByCounter=neighbors[at].some(n=>n!==at && board[n]*team>0 && BEATS[Math.abs(board[n])]===Math.abs(other));
        danger=Math.max(danger,protectedByCounter?14:48);
      }
    }
    value+=mobility*.8-danger;
    if(dist===1) value+=180; else if(dist===2) value+=36;
    score[team]+=value;
  }
  for(const team of [1,-1]) score[team]+=(8-nearest[team])*13;
  return Math.round((score[side]-score[-side])*10)/10;
}
// A route is a positional estimate with opponents held still, not a forced win.
// Multi-source BFS tracks each piece type separately: same/stronger enemies and
// friendly pieces block routes; exposed intermediate squares are excluded.
function goalFeatures(board,side) {
  const goal=side===1?80:0, danger=[null,new Uint8Array(81),new Uint8Array(81),new Uint8Array(81)];
  let enemyCount=0;
  for(let at=0;at<81;at++) if(board[at]*side<0) {
    enemyCount++;
    for(const to of neighbors[at]) danger[BEATS[Math.abs(board[at])]][to]=1;
  }
  const visited=new Uint8Array(324),queue=new Int16Array(324),steps=new Uint8Array(324);
  let head=0,tail=0,route=99;
  for(let at=0;at<81;at++) if(board[at]*side>0) {
    const state=Math.abs(board[at])*81+at;visited[state]=1;queue[tail++]=state;
  }
  while(head<tail) {
    const state=queue[head++],at=state%81,type=Math.floor(state/81);
    if(at===goal) {route=steps[state];break;}
    for(const to of neighbors[at]) {
      const target=board[to],next=type*81+to;
      if(visited[next] || target*side>0 || (target*side<0 && BEATS[type]!==Math.abs(target)) || (to!==goal && danger[type][to]))continue;
      visited[next]=1;steps[next]=steps[state]+1;queue[tail++]=next;
    }
  }
  const enemyMobility=moves(board,-side).length;
  const pressure=[8000,1500,620,310,180,105,60,30,12];
  // Terminal wins always outrank these estimates. Material is only secondary;
  // reduced enemy mobility/count model the other two actual victory conditions.
  const score=(pressure[route]??0)+(enemyMobility<5?(5-enemyMobility)*65:0)+(enemyCount<3?(3-enemyCount)*70:0);
  return {route:route===99?null:route,enemyMobility,enemyCount,score};
}
export function assessObjectives(position) {
  const board=encode(position);
  return {blue:goalFeatures(board,1),red:goalFeatures(board,-1),routeAssumption:'Static board; safe intermediate squares. An estimate, not a forced-win proof.'};
}
function goalEvaluation(board,side) {return goalFeatures(board,side).score-goalFeatures(board,-side).score+evaluate(board,side)*.35;}
function reasonFor(position,move,goalDriven=false) {
  const piece=position.board[move.from], target=position.board[move.to];
  if(move.to===(piece.side==='blue'?'i9':'a1')) return '攻入對方基地，直接結束對局。';
  if(goalDriven) {
    const board=encode(position),side=piece.side==='blue'?1:-1;
    const before=goalFeatures(board,side),enemyBefore=goalFeatures(board,-side);
    board[index(move.to)]=board[index(move.from)];board[index(move.from)]=0;
    const after=goalFeatures(board,side),enemyAfter=goalFeatures(board,-side);
    if(!after.enemyCount || !after.enemyMobility) return '以清空敵子或封鎖合法走法，達成勝利條件。';
    if((enemyAfter.route??99)>(enemyBefore.route??99))return '延緩對手通往基地的路線，避免對手先完成勝利條件。';
    if((after.route??99)<(before.route??99))return '縮短通往敵方基地的可行路線，朝基地勝利條件推進。';
    if(after.enemyMobility<before.enemyMobility)return '壓縮對手的合法走法，改善封鎖與突破基地的機會。';
    return '比較雙方基地路線與終局機會，保留較有利的勝利計畫。';
  }
  if(target) return `利用剋制關係吃掉${{R:'石頭',P:'布',S:'剪刀'}[target.type]}，並評估後續交換。`;
  const from=index(move.from),to=index(move.to),board=encode(position),side=piece.side==='blue'?1:-1;
  const attacked=neighbors[from].some(n=>board[n]*side<0&&BEATS[Math.abs(board[n])]===TYPES[piece.type]);
  if(attacked) return '調整受攻擊棋子的位置，降低直接損失的風險。';
  if(neighbors[to].some(n=>board[n]*side<0&&BEATS[TYPES[piece.type]]===Math.abs(board[n]))) return '對敵子形成威脅，爭取下一步的主動權。';
  if(distance(to,side===1?80:0)<distance(from,side===1?80:0)) return '向對方基地推進，同時考慮活動空間與棋子安全。';
  return '調整陣形與保護關係，為後續進攻保留走法。';
}
export function chooseMove(position, difficulty='medium', options={}) {
  const config=LEVELS[difficulty]; if(!config) throw new Error('Unknown difficulty');
  if(position.result) return {move:null,depth:0,nodes:0,reason:'對局已結束。'};
  const started=performance.now(), budget=options.timeMs??config.timeMs, deadline=started+Math.max(1,budget);
  const random=options.random??Math.random, board=encode(position), side=position.turn==='blue'?1:-1;
  const evaluatePosition=config.goalDriven?goalEvaluation:evaluate;
  const historyCounts=new Map();
  for(const key of options.historyKeys??[]) historyCounts.set(key,(historyCounts.get(key)||0)+1);
  let nodes=0,completedDepth=0,timedOut=false;
  const table=new Map(), ordering=new Map(), killers=[], STOP=Symbol('deadline');
  function checkTime() { if((++nodes&63)===0 && performance.now()>=deadline) throw STOP; }
  function terminal(current,ply) {
    if(board[current===1?0:80]*current<0) return -WIN+ply;
    if(board[current===1?80:0]*current>0) return WIN-ply;
    return null;
  }
  function ordered(list,current,preferred,ply) {
    const goal=current===1?80:0;
    return list.map(m=>({m,rank:(m.to===goal?1000000:0)+(preferred===m.from*81+m.to?100000:0)+(m.capture?10000:0)+(killers[ply]===m.from*81+m.to?1000:0)+(distance(m.from,goal)-distance(m.to,goal))*15}))
      .sort((a,b)=>b.rank-a.rank).map(x=>x.m);
  }
  function visitMove(m,current,quiet,callback) {
    const piece=board[m.from],captured=board[m.to]; board[m.to]=piece; board[m.from]=0;
    try { return callback(-current,captured?0:quiet+1); }
    finally { board[m.from]=piece; board[m.to]=captured; }
  }
  function quietSearch(current,quiet,alpha,beta,remaining,ply) {
    checkTime(); const end=terminal(current,ply); if(end!==null) return end;
    const all=moves(board,current); if(!all.length) return -WIN+ply;
    if(quiet>=200) return 0;
    // At a threatened base, examine all evasions rather than standing pat.
    const goal=current===1?80:0,ownGoal=current===1?0:80;
    if(all.some(m=>m.to===goal)) return WIN-ply-1;
    const baseThreat=moves(board,-current).some(m=>m.to===ownGoal);
    const value=evaluatePosition(board,current);
    if(remaining<=0) return value;
    if(!baseThreat) { if(value>=beta) return value; alpha=Math.max(alpha,value); }
    const forcing=baseThreat?all:all.filter(m=>m.capture || (config.goalDriven && distance(m.to,goal)===1));
    for(const m of ordered(forcing,current,null,ply)) {
      const value=visitMove(m,current,quiet,(next,q)=>-quietSearch(next,q,-beta,-alpha,remaining-1,ply+1));
      if(value>=beta) return value; alpha=Math.max(alpha,value);
    }
    return alpha;
  }
  function search(current,quiet,depth,alpha,beta,ply,path) {
    checkTime(); const end=terminal(current,ply); if(end!==null) return end;
    const list=moves(board,current); if(!list.length) return -WIN+ply;
    if(quiet>=200) return 0;
    const key=positionKey(board,current);
    // Repetition is a search preference, not an added rule of the game.
    if(path.has(key)) return 0;
    if(depth<=0) return quietSearch(current,quiet,alpha,beta,config.qDepth,ply);
    const cacheKey=key+':'+quiet+':'+ply;
    const entry=table.get(cacheKey), originalAlpha=alpha, originalBeta=beta;
    // Path-sensitive repetitions make cached scores unsafe; cache move ordering only.
    const preferred=entry?.move??ordering.get(key);
    let best=-Infinity,bestId=null; path.add(key);
    try {
      for(const m of ordered(list,current,preferred,ply)) {
        const value=visitMove(m,current,quiet,(next,q)=>-search(next,q,depth-1,-beta,-alpha,ply+1,path));
        if(value>best) {best=value;bestId=m.from*81+m.to;}
        alpha=Math.max(alpha,value);
        if(alpha>=beta) {if(!m.capture)killers[ply]=bestId;break;}
      }
    } finally { path.delete(key); }
    if(table.size<50000) table.set(cacheKey,{move:bestId,depth,score:best,flag:best<=originalAlpha?'upper':best>=originalBeta?'lower':'exact'});
    ordering.set(key,bestId); return best;
  }
  let roots=moves(board,side);
  if(!roots.length) return {move:null,depth:0,nodes,reason:'沒有合法走法。'};
  // Always take immediate wins. Avoid immediate defeat when any safe reply exists.
  const ranked=roots.map(m=>visitMove(m,side,position.quietPly||0,(next,q)=>{
    const won=terminal(next,1)!==null || !moves(board,next).length;
    const unsafe=!won && q<200 && moves(board,next).some(reply=>reply.to===(next===1?80:0));
    return {m,won,unsafe,score:won?WIN-1:-evaluatePosition(board,next)};
  }));
  const win=ranked.find(r=>r.won);
  if(win) return finish(win.m,WIN-1,1);
  const safe=ranked.filter(r=>!r.unsafe), candidates=safe.length?safe:ranked;
  candidates.sort((a,b)=>b.score-a.score);
  let best=candidates[0].m,bestScore=candidates[0].score;
  roots=candidates.map(r=>r.m);
  if(difficulty==='easy') {
    const varied=candidates.map(r=>({...r,noisy:r.score+random()*config.noise})).sort((a,b)=>b.noisy-a.noisy);
    best=varied[0].m;bestScore=varied[0].score;completedDepth=1;
  } else {
    for(let depth=1;depth<=config.depth;depth++) {
      let iterationBest=null,iterationScore=-Infinity;const results=[];
      try {
        for(const m of roots) {
          if(performance.now()>=deadline) throw STOP;
          const value=visitMove(m,side,position.quietPly||0,(next,q)=>{
            const repetitionPenalty=(historyCounts.get(positionKey(board,next))||0)*12;
            return -search(next,q,depth-1,-WIN-1,-iterationScore-repetitionPenalty,1,new Set([positionKey(encode(position),side)]))-repetitionPenalty;
          });
          results.push({m,score:value});
          if(value>iterationScore) {iterationScore=value;iterationBest=m;}
        }
        best=iterationBest;bestScore=iterationScore;completedDepth=depth;
        roots=results.sort((a,b)=>b.score-a.score).map(r=>r.m);
        if(bestScore>WIN-100) break;
      } catch(error) {if(error!==STOP) throw error;timedOut=true;break;}
    }
  }
  return finish(best,bestScore,completedDepth);
  function finish(m,score,depth) {
    const move={from:square(m.from),to:square(m.to)};
    return {move,score,depth,nodes,timeMs:Math.round(performance.now()-started),timedOut,difficulty,objective:config.goalDriven?'victory-conditions':'position-and-exchanges',reason:reasonFor(position,move,config.goalDriven)};
  }
}
