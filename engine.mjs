export const FILES = 'abcdefghi';
export const BASES = { blue: 'a1', red: 'i9' };
export const BEATS = { R: 'S', S: 'P', P: 'R' };
export const opposite = side => side === 'blue' ? 'red' : 'blue';
export const isSquare = value => typeof value === 'string' && /^[a-i][1-9]$/.test(value);
export function initialBoard() {
  const board = {};
  const setup = { R: ['b4', 'c3', 'd2'], P: ['b5', 'c4', 'd3', 'e2'], S: ['c5', 'd4', 'e3'] };
  for (const [type, squares] of Object.entries(setup)) {
    for (const square of squares) {
      board[square] = { side: 'blue', type };
      board[FILES[9 - Number(square[1])] + (9 - FILES.indexOf(square[0]))] = { side: 'red', type };
    }
  }
  return board;
}
export function destinations(board, from) {
  if (!isSquare(from) || !board[from]) return [];
  const piece = board[from], result = [];
  const x = FILES.indexOf(from[0]), y = Number(from[1]);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    if (x + dx < 0 || x + dx > 8 || y + dy < 1 || y + dy > 9) continue;
    const to = FILES[x + dx] + (y + dy), target = board[to];
    if (!target || (target.side !== piece.side && BEATS[piece.type] === target.type)) result.push(to);
  }
  return result;
}
export function legalMoves(position, side = position.turn) {
  if (position.result) return [];
  return Object.entries(position.board).filter(([, p]) => p.side === side)
    .flatMap(([from]) => destinations(position.board, from).map(to => ({ from, to, capture: position.board[to]?.type ?? null, winsBase: to === BASES[opposite(side)] })));
}
export function initialPosition() {
  return { board: initialBoard(), turn: 'blue', ply: 0, quietPly: 0, result: null, lastMove: null };
}
export function applyMove(position, from, to) {
  if (position.result) throw new Error('對局已結束，請開始新局。');
  if (!isSquare(from) || !isSquare(to)) throw new Error('座標須為 a1 到 i9。');
  const piece = position.board[from];
  if (!piece || piece.side !== position.turn) throw new Error('請移動當前回合一方的棋子。');
  if (!destinations(position.board, from).includes(to)) throw new Error('不合法的走法：只能走相鄰一格，並吃掉被剋制的敵子。');
  const capture = position.board[to] ?? null, board = { ...position.board, [to]: piece };
  delete board[from];
  const next = { board, turn: opposite(piece.side), ply: position.ply + 1, quietPly: capture ? 0 : position.quietPly + 1, result: null,
    lastMove: { from, to, side: piece.side, type: piece.type, capture: capture?.type ?? null } };
  if (to === BASES[next.turn]) next.result = { winner: piece.side, reason: 'base' };
  else if (!Object.values(board).some(p => p.side === next.turn)) next.result = { winner: piece.side, reason: 'no_pieces' };
  else if (!legalMoves(next).length) next.result = { winner: piece.side, reason: 'no_legal_moves' };
  else if (next.quietPly >= 200) next.result = { winner: null, reason: 'stagnation' };
  return next;
}
export class Match {
  constructor(humanSide = 'blue', id = crypto.randomUUID()) {
    if (!['blue', 'red'].includes(humanSide)) throw new Error('無效的玩家顏色。');
    this.id = id; this.humanSide = humanSide; this.revision = 0;
    this.timeline = [initialPosition()]; this.cursor = 0;
  }
  get position() { return this.timeline[this.cursor]; }
  get agentSide() { return opposite(this.humanSide); }
  move({ from, to, actor, expectedRevision, gameId }) {
    if (gameId !== this.id || expectedRevision !== this.revision) throw new Error('棋局已改變，請重新讀取棋盤後再走。');
    if (!['human', 'agent'].includes(actor)) throw new Error('無效的操作者。');
    const side = actor === 'human' ? this.humanSide : this.agentSide;
    if (this.position.turn !== side) throw new Error(actor === 'agent' ? '現在輪到玩家，請等待。' : '現在輪到 Codex。');
    const next = applyMove(this.position, from, to);
    this.timeline = this.timeline.slice(0, this.cursor + 1).concat(next);
    this.cursor++; this.revision++; return this.snapshot();
  }
  undo() {
    if (!this.cursor) throw new Error('目前沒有可悔棋的步驟。');
    this.cursor--; this.revision++;
  }
  redo() {
    if (this.cursor >= this.timeline.length - 1) throw new Error('沒有可重做的步驟。');
    this.cursor++; this.revision++;
  }
  snapshot() {
    return structuredClone({ gameId: this.id, revision: this.revision, humanSide: this.humanSide, agentSide: this.agentSide,
      ...this.position, legalMoves: legalMoves(this.position), history: this.timeline.slice(1, this.cursor + 1).map(p => p.lastMove) });
  }
}
