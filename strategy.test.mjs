import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPosition, legalMoves, applyMove } from './engine.mjs';
import { chooseMove, searchLegalMoves, LEVELS, assessObjectives } from './strategy.mjs';
const piece=(side,type)=>({side,type});
const fixture=(board,turn='red')=>({...initialPosition(),board,turn});
test('search rules match the game over 160 seeded legal positions',()=>{
  let p=initialPosition(),seed=47;
  for(let i=0;i<160;i++) {
    const expected=legalMoves(p).map(m=>m.from+m.to).sort();
    assert.deepEqual(searchLegalMoves(p).map(m=>m.from+m.to).sort(),expected);
    if(p.result) {p=initialPosition();continue;}
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const m=legalMoves(p)[seed%expected.length];p=applyMove(p,m.from,m.to);
  }
});
test('all levels take immediate base wins on either side',()=>{
  for(const level of Object.keys(LEVELS)) for(const side of ['blue','red']) {
    const p=side==='blue'?fixture({h8:piece(side,'S'),b4:piece('red','R')},side):fixture({b2:piece(side,'S'),h8:piece('blue','R')},side);
    const result=chooseMove(p,level);assert.equal(applyMove(p,result.move.from,result.move.to).result.winner,side);
  }
});
test('all levels stop a one-move base loss when defense exists',()=>{
  const p=fixture({b2:piece('red','R'),h8:piece('blue','S'),g7:piece('red','R')});
  // Red has its own immediate win at a1, which must take precedence over defense.
  for(const level of Object.keys(LEVELS)) assert.equal(chooseMove(p,level).move.to,'a1');
  delete p.board.b2;
  for(const level of Object.keys(LEVELS)) assert.deepEqual(chooseMove(p,level).move,{from:'g7',to:'h8'});
});
test('medium/hard reject a poisoned capture after seeing the recapture',()=>{
  const p=fixture({d4:piece('red','S'),e5:piece('blue','P'),f6:piece('blue','R'),h8:piece('red','P'),a4:piece('blue','S')});
  for(const level of ['medium','hard']) {
    const r=chooseMove(p,level,{timeMs:350});assert.notDeepEqual(r.move,{from:'d4',to:'e5'});
  }
});
test('engine responds to the real exchange from this match',()=>{
  const p=fixture({g6:piece('red','R'),f6:piece('blue','S'),f7:piece('red','P'),e3:piece('blue','S'),c4:piece('blue','P'),d2:piece('blue','R')});
  for(const level of ['medium','hard']) assert.deepEqual(chooseMove(p,level,{timeMs:350}).move,{from:'g6',to:'f6'});
});
test('time limit returns a legal move; input is immutable; completed games stop',()=>{
  const p=initialPosition(),before=structuredClone(p);
  const result=chooseMove(p,'hard',{timeMs:1});
  assert.ok(legalMoves(p).some(m=>m.from===result.move.from&&m.to===result.move.to));
  assert.deepEqual(p,before);assert.ok(result.timeMs<500);
  assert.equal(chooseMove({...p,result:{winner:'blue',reason:'base'}},'hard').move,null);
});
test('hard and medium use different bounded search budgets',()=>{
  assert.ok(LEVELS.hard.depth>LEVELS.medium.depth);
  const p=fixture({e5:piece('red','R'),d3:piece('blue','S'),g4:piece('blue','P')});
  const medium=chooseMove(p,'medium'),hard=chooseMove(p,'hard');
  assert.ok(medium.depth>=2);assert.ok(hard.depth>=medium.depth);
});
test('hard chooses a forced base plan over an available capture',()=>{
  const p=fixture({c2:piece('red','R'),f6:piece('red','S'),g5:piece('blue','P'),h7:piece('blue','R')});
  const result=chooseMove(p,'hard');
  assert.equal(result.move.from,'c2');assert.equal(result.objective,'victory-conditions');
  assert.ok(result.score>99000);
  const next=applyMove(p,result.move.from,result.move.to);
  // Exhaustively verify every opponent reply still permits the base win.
  for(const reply of legalMoves(next)) {
    const afterReply=applyMove(next,reply.from,reply.to);
    assert.ok(legalMoves(afterReply).some(m=>m.winsBase));
  }
});
test('hard recognizes immobilization as a winning objective',()=>{
  const p=fixture({a9:piece('blue','R'),a8:piece('red','R'),b8:piece('red','R'),c8:piece('red','R')});
  const result=chooseMove(p,'hard');
  const end=applyMove(p,result.move.from,result.move.to);
  assert.deepEqual(end.result,{winner:'red',reason:'no_legal_moves'});
});
test('goal route estimates account for hostile control, not just geometric distance',()=>{
  const open=fixture({g7:piece('blue','R'),a5:piece('red','P')},'blue');
  const guarded=fixture({g7:piece('blue','R'),h8:piece('red','P')},'blue');
  assert.equal(assessObjectives(open).blue.route,2);
  const guardedRoute=assessObjectives(guarded).blue.route;
  assert.ok(guardedRoute===null || guardedRoute>2);
});
