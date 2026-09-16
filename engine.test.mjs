import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, initialBoard, initialPosition, applyMove, destinations } from './engine.mjs';
test('official 9x9 setup: each side has 3 rocks, 4 papers, 3 scissors; anti-diagonal reflection', () => {
  const b = initialBoard(); assert.equal(Object.keys(b).length, 20);
  for (const side of ['blue', 'red']) for (const [type, n] of [['R',3],['P',4],['S',3]]) assert.equal(Object.values(b).filter(p => p.side === side && p.type === type).length, n);
  assert.deepEqual(b.f8, { side: 'red', type: 'R' }); assert.deepEqual(b.g7, { side: 'red', type: 'R' });
  assert.equal(b.a1, undefined); assert.equal(b.i9, undefined);
});
test('movement: eight neighbors, edges, blockers, all nine capture combinations', () => {
  assert.equal(destinations({ e5: { side: 'blue', type: 'R' } }, 'e5').length, 8);
  assert.equal(destinations({ a1: { side: 'blue', type: 'R' } }, 'a1').length, 3);
  for (const own of ['R','P','S']) for (const target of ['R','P','S']) {
    const b = { e5: { side: 'blue', type: own }, f6: { side: 'red', type: target } };
    assert.equal(destinations(b, 'e5').includes('f6'), ['RS','PR','SP'].includes(own + target));
    b.f6.side = 'blue'; assert.equal(destinations(b, 'e5').includes('f6'), false);
  }
});
test('reject invalid, distant, empty and wrong-side moves without mutating position', () => {
  const p = initialPosition(), before = structuredClone(p);
  for (const [from,to] of [['b4','b6'],['a1','a2'],['f8','f9'],['z2','e4'],['b4','b4']]) assert.throws(() => applyMove(p, from, to));
  assert.deepEqual(p,before);
});
test('base win, elimination and no-legal-move win terminate play', () => {
  const base = { ...initialPosition(), board: { h8: { side: 'blue', type: 'P' }, a8: { side: 'red', type: 'R' } } };
  const won = applyMove(base,'h8','i9'); assert.deepEqual(won.result,{winner:'blue',reason:'base'}); assert.throws(() => applyMove(won,'a8','a7'));
  const elim = { ...initialPosition(), board: { e5:{side:'blue',type:'P'},f6:{side:'red',type:'R'} } };
  assert.equal(applyMove(elim,'e5','f6').result.reason,'no_pieces');
  const block = { ...initialPosition(), board: { a9:{side:'red',type:'R'},a8:{side:'blue',type:'P'},b8:{side:'blue',type:'P'},c8:{side:'blue',type:'P'} } };
  assert.equal(applyMove(block,'c8','b9').result.reason,'no_legal_moves');
});
test('200 non-capture plies draw; capture resets clock; base win takes precedence', () => {
  const p = { ...initialPosition(), quietPly:199 };
  assert.equal(applyMove(p,'b4','a4').result.reason,'stagnation');
  p.board.a4 = {side:'red',type:'S'}; assert.equal(applyMove(p,'b4','a4').quietPly,0);
  const base = { ...initialPosition(), quietPly:199, board:{ h8:{side:'blue',type:'P'},a8:{side:'red',type:'R'} } };
  assert.equal(applyMove(base,'h8','i9').result.reason,'base');
});
test('agent ownership, stale revisions, game identity, undo/redo and branching', () => {
  const m = new Match('blue','test');
  const play = (from,to,actor,expectedRevision=m.revision,gameId=m.id) => m.move({from,to,actor,expectedRevision,gameId});
  assert.throws(() => play('b4','a4','agent'));
  play('b4','a4','human'); play('f8','f9','agent'); assert.equal(m.position.ply,2);
  const previousRevision=m.revision; m.undo(); assert.equal(m.position.turn,'red'); assert.throws(() => play('f8','f9','agent',previousRevision));
  assert.throws(() => play('f8','f9','agent',m.revision,'wrong-game'));
  m.redo(); assert.equal(m.position.ply,2); m.undo(); play('f8','g9','agent');
  assert.throws(() => m.redo()); assert.equal(m.position.board.g9.side,'red');
  const snapshot=m.snapshot(); snapshot.board.g9.type='RUBBISH'; assert.equal(m.position.board.g9.type,'R');
});
