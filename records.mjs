import { Match, legalMoves } from './engine.mjs';

export const RECORD_FORMAT = 'intransitive-record-v1';
const STORAGE_KEY = 'intransitive-saved-records-v1';
const MODES = ['easy', 'medium', 'hard', 'codex'];

export function makeRecord(match, opponent, name = '') {
  return {
    format: RECORD_FORMAT, id: crypto.randomUUID(),
    name: (name.trim() || `練習局 ${new Date().toLocaleString('zh-TW')}`).slice(0, 80),
    savedAt: new Date().toISOString(), sourceGameId: match.id,
    humanSide: match.humanSide, opponent, cursor: match.cursor,
    moves: match.timeline.slice(1).map(p => ({ from: p.lastMove.from, to: p.lastMove.to }))
  };
}

// Rebuild from legal moves; never trust a serialized board or supplied result.
export function restoreRecord(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('戰役格式無效。');
  const legacy = data.format === 'intransitive-practice-v1';
  if (!legacy && data.format !== RECORD_FORMAT) throw new Error('不支援此戰役版本。');
  const moves = legacy ? data.history : data.moves;
  const cursor = legacy ? moves?.length : data.cursor;
  const opponent = data.opponent ?? 'codex';
  if (!MODES.includes(opponent) || !['blue', 'red'].includes(data.humanSide) || !Array.isArray(moves) || moves.length > 10000 || !Number.isInteger(cursor) || cursor < 0 || cursor > moves.length) throw new Error('戰役的對手、顏色或步數無效。');
  if (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 80)) throw new Error('戰役名稱最多 80 字。');
  const match = new Match(data.humanSide);
  for (const move of moves) {
    if (!move || typeof move !== 'object') throw new Error('戰役走法無效。');
    match.move({ from: move.from, to: move.to, actor: match.position.turn === match.humanSide ? 'human' : 'agent', gameId: match.id, expectedRevision: match.revision });
  }
  match.cursor = cursor;
  return { match, opponent };
}

export function reviewPosition(record, ply) {
  const { match, opponent } = restoreRecord(record);
  if (!Number.isInteger(ply) || ply < 0 || ply >= match.timeline.length) throw new Error(`步數須為 0 到 ${match.timeline.length - 1}。`);
  const position = match.timeline[ply];
  return structuredClone({ recordId: record.id, name: record.name, opponent, humanSide: match.humanSide,
    sourceGameId: record.sourceGameId, currentPly: record.cursor, totalPlies: match.timeline.length - 1,
    isRedoBranch: ply > record.cursor, ...position, legalMoves: legalMoves(position),
    previousMove: position.lastMove, nextMove: match.timeline[ply + 1]?.lastMove ?? null,
    history: match.timeline.slice(1, ply + 1).map(p => p.lastMove) });
}

export class RecordStore {
  constructor(storage) { this.storage = storage; }
  read() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    let records;
    try { records = JSON.parse(raw); } catch { throw new Error('戰役儲存資料損壞，未覆寫舊資料。'); }
    if (!Array.isArray(records) || records.length > 100 || records.some(r => !r || r.format !== RECORD_FORMAT || typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.moves))) throw new Error('戰役儲存資料無效，未覆寫舊資料。');
    return records;
  }
  list() { return this.read().map(({ id, name, savedAt, humanSide, opponent, cursor, moves, sourceGameId }) => ({ id, name, savedAt, humanSide, opponent, currentPly: cursor, totalPlies: moves.length, sourceGameId })); }
  get(id) {
    const record = this.read().find(r => r.id === id);
    if (!record) throw new Error('找不到指定戰役。');
    return record;
  }
  save(record) {
    restoreRecord(record);
    const records = this.read();
    if (records.length >= 100) throw new Error('已達 100 份存檔上限，請先匯出備份。');
    const next = { ...record, id: crypto.randomUUID(), savedAt: new Date().toISOString() };
    this.storage.setItem(STORAGE_KEY, JSON.stringify([next, ...records]));
    return next;
  }
  import(text) {
    if (typeof text !== 'string' || text.length > 1000000) throw new Error('匯入檔案不可超過 1 MB。');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('請提供有效的 JSON 戰役檔。'); }
    const { match, opponent } = restoreRecord(data);
    return this.save(makeRecord(match, opponent, data.name || '匯入的戰役'));
  }
}
