import { Match, FILES, BASES, opposite, destinations, legalMoves, isSquare } from './engine.mjs';
import { LEVELS, strategyPositionKey } from './strategy.mjs';
import { BotController } from './bot-controller.mjs';
import { makeRecord, restoreRecord, reviewPosition, RecordStore } from './records.mjs';
const $ = id => document.getElementById(id);
const NAMES = { R: '石', P: '布', S: '剪' }, COLORS = { blue: '藍方', red: '紅方' };
const trainingPage = new URLSearchParams(location.search).has('training');
const STORE = trainingPage ? 'intransitive-engine-training-v1' : 'intransitive-practice-v1';
let match = new Match(), selected = null, flipped = false, toastTimer, storageWarning = false;
let connection = '正在準備對戰工具…', connected = false;
const publicPage = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let mode = trainingPage || publicPage ? 'easy' : 'codex', paused = false, thinking = false, analysis = null, botError = '';
const bot = new BotController();
const records = new RecordStore({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
let reviewRecord = null;
const opponentName = () => mode === 'codex' ? 'Codex' : `${LEVELS[mode].label}引擎`;
const positionLabel = ply => ply === 0 ? '初始盤面 · 尚未落子' : `第 ${ply} 手後 · 第 ${Math.ceil(ply / 2)} 回合${ply % 2 ? '藍' : '紅'}方走完`;
const nextMoveLabel = p => p.result ? `對局結束 · 共 ${p.ply} 手` : `下一手：第 ${p.ply + 1} 手 · 第 ${Math.floor(p.ply / 2) + 1} 回合${COLORS[p.turn]}`;
const descriptions = {easy:'適合熟悉走位；選步較多變，會留下可利用的機會。',medium:'預判短期交換，兼顧棋子安全、活動空間與基地攻防。',hard:'以勝利條件規劃：突破基地、阻止對手先抵達、封鎖走法；每步思考預算 1.6 秒。',codex:'走完後到 Codex 對話說「換你」，由 Codex 直接落子。'};
try {
  const saved = JSON.parse(sessionStorage.getItem(STORE) || 'null');
  if (saved && saved.version === 1 && Array.isArray(saved.moves) && saved.moves.length < 10000) {
    const restored = new Match(saved.humanSide, saved.id);
    for (const move of saved.moves) restored.move({ ...move, actor: restored.position.turn === restored.humanSide ? 'human' : 'agent', gameId: restored.id, expectedRevision: restored.revision });
    if (!Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor > saved.moves.length) throw new Error('invalid saved cursor');
    restored.cursor = saved.cursor;
    restored.revision = Number.isSafeInteger(saved.revision) ? Math.max(saved.revision, restored.revision) + 1 : restored.revision + 1;
    match = restored; flipped = saved.flipped === true;
    mode = saved.mode === 'codex' || LEVELS[saved.mode] ? saved.mode : mode;
    paused = saved.paused === true;
  }
} catch { storageWarning = true; }
function save() {
  try { sessionStorage.setItem(STORE, JSON.stringify({ version: 1, id: match.id, revision: match.revision, humanSide: match.humanSide,
    cursor: match.cursor, flipped, mode, paused, moves: match.timeline.slice(1).map(p => ({ from: p.lastMove.from, to: p.lastMove.to })) })); }
  catch { toast('瀏覽器無法保存棋局；關閉或重新整理可能會遺失進度。'); }
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function counts(side) {
  const pieces = Object.values(match.position.board).filter(p => p.side === side);
  return ['R', 'P', 'S'].map(type => `<span>${NAMES[type]} <b>${pieces.filter(p => p.type === type).length}</b></span>`).join('');
}
function render() {
  const focusedSquare = document.activeElement?.dataset?.square;
  const p = match.position, humanTurn = p.turn === match.humanSide;
  const options = selected ? destinations(p.board, selected) : [];
  const squares = [];
  const rows = flipped ? [1,2,3,4,5,6,7,8,9] : [9,8,7,6,5,4,3,2,1];
  const files = flipped ? [...FILES].reverse() : [...FILES];
  for (const row of rows) for (const file of files) {
    const square = file + row, piece = p.board[square], target = options.includes(square);
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.square = square;
    button.className = ['cell', (FILES.indexOf(file) + row) % 2 ? 'dark' : '', square === 'a1' ? 'base-blue' : '', square === 'i9' ? 'base-red' : '',
      p.lastMove && [p.lastMove.from, p.lastMove.to].includes(square) ? 'last' : '', selected === square ? 'selected' : '', target ? 'legal' : '', target && piece ? 'capture' : ''].filter(Boolean).join(' ');
    button.setAttribute('aria-label', `${square.toUpperCase()} ${piece ? COLORS[piece.side] + NAMES[piece.type] : '空格'}${square === 'a1' ? ' 藍方基地' : square === 'i9' ? ' 紅方基地' : ''}${target ? (piece ? ' 可吃子' : ' 可移動') : ''}`);
    button.setAttribute('aria-pressed', String(selected === square));
    if (piece) button.innerHTML = `<span class="piece ${piece.side}"><span class="piece-symbol">${NAMES[piece.type]}</span><span class="piece-type">${piece.type}</span></span>`;
    button.insertAdjacentHTML('beforeend', `<span class="coordinate" aria-hidden="true">${square.toUpperCase()}</span>`);
    button.addEventListener('click', () => selectSquare(square));
    squares.push(button);
  }
  $('board').replaceChildren(...squares);
  if (focusedSquare) $('board').querySelector(`[data-square="${focusedSquare}"]`)?.focus({ preventScroll: true });
  $('board').setAttribute('aria-label', `9 乘 9 棋盤，${flipped ? 'I9' : 'A1'} 在左下角`);
  $('human-avatar').className = `avatar ${match.humanSide}`;
  $('agent-avatar').className = `avatar ${match.agentSide}`;
  $('agent-avatar').textContent = mode === 'codex' ? 'C' : '棋';
  $('agent-name').textContent = opponentName();
  $('opponent-select').value = mode;
  $('difficulty-description').textContent = descriptions[mode];
  $('pause-engine').hidden = mode === 'codex';
  $('pause-engine').textContent = paused ? '繼續' : '暫停';
  $('pause-engine').disabled = !!p.result;
  $('local-label').textContent = mode === 'codex' ? '你與 Codex 的棋局' : '自動對戰練習';
  $('human-caption').textContent = `${COLORS[match.humanSide]}・${match.humanSide === 'blue' ? '先手' : '後手'}`;
  $('agent-caption').textContent = `${COLORS[match.agentSide]}・${match.agentSide === 'blue' ? '先手' : '後手'}`;
  $('human-inventory').innerHTML = counts(match.humanSide); $('agent-inventory').innerHTML = counts(match.agentSide);
  $('round-label').textContent = `第 ${p.result ? Math.ceil(p.ply / 2) : Math.floor(p.ply / 2) + 1} 回合`;
  $('ply-label').textContent = p.result ? `共 ${p.ply} 手` : `第 ${p.ply + 1} 手待走`;
  $('board-progress').textContent = positionLabel(p.ply);
  $('turn-dot').className = `status-dot ${p.turn}`;
  const reason = { base: '攻入對方基地', no_pieces: '吃光對方棋子', no_legal_moves: '對手已無合法走法', stagnation: '連續 200 步沒有吃子' };
  $('turn-title').textContent = p.result ? (p.result.winner === null ? '和局' : p.result.winner === match.humanSide ? '你贏了！' : `${opponentName()}獲勝`) : mode !== 'codex' && paused ? '引擎已暫停' : humanTurn ? '輪到你了' : thinking ? '引擎思考中…' : `輪到${opponentName()}`;
  $('turn-description').textContent = p.result ? `${reason[p.result.reason]}。可以悔棋復盤，或開始新局。` : botError || (paused && mode !== 'codex' ? '可以悔棋、重做或重新思考；按「繼續」恢復自動回應。' : humanTurn ? `選一枚${match.humanSide === 'blue' ? '藍' : '紅'}色棋子，再點選要前進的格子。` : mode === 'codex' ? '到對話說「換你」，讓 Codex 讀盤並落子。' : '正在比較走法；你也可以暫停或悔棋。');
  $('connection').textContent = mode === 'codex' ? connection : '本機策略引擎 · 自動回應，不需傳訊息'; $('connection').className = `connection${mode !== 'codex' || connected ? ' live' : ''}`;
  $('engine-insight').hidden = !analysis || mode === 'codex';
  if (analysis) { $('engine-reason').textContent = analysis.reason; $('engine-metrics').textContent = `${analysis.objective==='victory-conditions'?'勝利條件規劃 · ':''}已完成 ${analysis.depth} 手搜尋 · ${(analysis.timeMs/1000).toFixed(2)} 秒`; }
  $('chat-hint').textContent = mode === 'codex' ? '走完後，在 Codex 對話說「換你」。我會讀取這個棋盤，直接走下一步。' : '你落子後，引擎會自動回應。可隨時調整難度，或開始新局改執另一色。';
  $('objective').innerHTML = `你的目標 <b>${BASES[match.agentSide].toUpperCase()}</b><span>進入${COLORS[match.agentSide]}基地即可獲勝</span>`;
  $('undo').disabled = !match.cursor; $('redo').disabled = match.cursor === match.timeline.length - 1;
  $('undo').textContent = mode === 'codex' ? '↶ 悔一步' : '↶ 悔一回合';
  $('selection-note').textContent = selected ? `${selected.toUpperCase()} 的${NAMES[p.board[selected].type]}：${options.length ? options.length + ' 個合法目的地' : '目前無法移動'}。` : p.result ? '對局結束，可悔棋復盤。' : humanTurn ? '點選棋子，查看合法走法。' : `等待${opponentName()}落子；也可以悔棋重想。`;
  const history = match.timeline.slice(1, match.cursor + 1).map(position => position.lastMove);
  if (!history.length) $('history').innerHTML = `<div class="empty-history"><span aria-hidden="true">↗</span><p>第一步，由${match.humanSide === 'blue' ? '你' : opponentName()}開始。</p><small>每一步都會記錄在這裡</small></div>`;
  else {
    const notation = m => m ? `${m.from.toUpperCase()}${m.capture ? '×' : '–'}${m.to.toUpperCase()}` : '—';
    const lines = [];
    for (let i = 0; i < history.length; i += 2) lines.push(`<div class="history-row"><span>${i / 2 + 1}</span><span class="blue"><small>第 ${i + 1} 手</small>${notation(history[i])}</span><span class="red">${history[i + 1] ? `<small>第 ${i + 2} 手</small>` : ''}${notation(history[i + 1])}</span></div>`);
    $('history').innerHTML = lines.join(''); $('history').scrollTop = $('history').scrollHeight;
  }
}
function stopBot() {bot.cancel();thinking=false;}
function scheduleBot() {
  if(mode==='codex'||paused||thinking||match.position.result||match.position.turn===match.humanSide||$('new-dialog').open||$('records-dialog').open)return;
  const gameId=match.id,expectedRevision=match.revision,difficulty=mode;
  thinking=true;botError='';render();
  bot.start({id:`${gameId}:${expectedRevision}:${difficulty}`,position:structuredClone(match.position),difficulty,historyKeys:match.timeline.slice(0,match.cursor+1).map(strategyPositionKey)},result=>{
    thinking=false;
    if(match.id!==gameId||match.revision!==expectedRevision||mode!==difficulty||paused)return;
    try {
      if(!result.move)throw new Error('引擎沒有回傳走法。');
      match.move({...result.move,actor:'agent',gameId,expectedRevision});analysis=result;changed();
    } catch(error) {paused=true;botError=error.message;save();render();}
  },message=>{thinking=false;paused=true;botError=message;save();render();});
}
function changed() { selected = null; save(); render(); scheduleBot(); }
function selectSquare(square) {
  const p = match.position;
  if (p.result) return toast('對局已結束，可以悔棋復盤或開始新局。');
  if (p.turn !== match.humanSide) return toast(mode==='codex' ? '現在輪到 Codex。回到對話說「換你」即可。' : paused ? '請按「繼續」，讓引擎走下一步。' : '引擎正在思考，請稍候。');
  if (selected && destinations(p.board, selected).includes(square)) {
    match.move({ from: selected, to: square, actor: 'human', expectedRevision: match.revision, gameId: match.id }); changed();
  } else if (p.board[square]?.side === match.humanSide) { selected = selected === square ? null : square; render(); }
  else { selected = null; render(); }
}
$('board').addEventListener('keydown', event => {
  const button = event.target.closest('[data-square]'); if (!button) return;
  if (event.key === 'Escape') { selected = null; render(); document.querySelector(`[data-square="${button.dataset.square}"]`)?.focus(); return; }
  const delta = { ArrowRight: [1,0], ArrowLeft: [-1,0], ArrowUp: [0,1], ArrowDown: [0,-1] }[event.key];
  if (!delta) return;
  event.preventDefault(); const sign = flipped ? -1 : 1;
  const x = FILES.indexOf(button.dataset.square[0]) + delta[0] * sign, y = Number(button.dataset.square[1]) + delta[1] * sign;
  if (x >= 0 && x < 9 && y > 0 && y < 10) document.querySelector(`[data-square="${FILES[x]}${y}"]`)?.focus();
});
$('undo').onclick = () => { stopBot(); match.undo(); if(mode!=='codex') { if(match.cursor>0&&match.position.turn!==match.humanSide)match.undo();paused=true; } analysis=null;botError='';changed(); };
$('redo').onclick = () => { stopBot(); match.redo(); if(mode!=='codex') { if(match.cursor<match.timeline.length-1&&match.position.turn!==match.humanSide)match.redo();paused=true; } analysis=null;botError='';changed(); };
$('opponent-select').onchange = event => {stopBot();mode=event.target.value;paused=false;analysis=null;botError='';changed();};
$('pause-engine').onclick = () => {stopBot();paused=!paused;botError='';changed();};
$('flip').onclick = () => { flipped = !flipped; selected = null; save(); render(); };
$('rules-button').onclick = () => $('rules-dialog').showModal();
$('new-game').onclick = () => { stopBot();document.querySelector(`input[name="side"][value="${match.humanSide}"]`).checked = true; $('new-opponent').value=mode;$('new-dialog').showModal();render(); };
$('new-dialog').addEventListener('close',()=>scheduleBot());
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
$('confirm-new').onclick = () => {
  match = new Match(document.querySelector('input[name="side"]:checked').value); flipped = match.humanSide === 'red';
  stopBot();mode=$('new-opponent').value;paused=false;analysis=null;botError='';
  $('new-dialog').close(); changed();
};
function downloadRecord(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `intransitive-${new Date().toISOString().slice(0,10)}.json`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已匯出目前棋譜。');
}
$('export').onclick = () => downloadRecord(makeRecord(match, mode));
function persistCurrent(name = '') {
  const record = records.save(makeRecord(match, mode, name));
  toast(`已儲存「${record.name}」。`); return record;
}
function readTargetRecord(recordId) {
  return recordId === undefined ? { ...makeRecord(match, mode, '目前棋局'), id: null } : records.get(recordId);
}
function loadRecord(record, expectedGameId, expectedRevision) {
  if (expectedGameId !== match.id || expectedRevision !== match.revision) throw new Error('目前棋局已改變，請重新讀盤後再載入。');
  const restored = restoreRecord(record); // Validate before changing any active state.
  const backup = records.save(makeRecord(match, mode, '載入前自動備份'));
  stopBot(); match = restored.match; mode = restored.opponent; flipped = match.humanSide === 'red';
  paused = true; analysis = null; botError = ''; changed();
  return { ...match.snapshot(), opponent: mode, paused, backupRecordId: backup.id };
}
function showRecordList(selectedId = '') {
  const list = records.list();
  $('saved-records').replaceChildren();
  const current = document.createElement('option'); current.value = ''; current.textContent = '目前棋局（即時快照）'; $('saved-records').append(current);
  for (const record of list) {
    const option = document.createElement('option'); option.value = record.id;
    option.textContent = `${record.name} · 第 ${record.currentPly} 手 · ${new Date(record.savedAt).toLocaleString('zh-TW')}`;
    $('saved-records').append(option);
  }
  $('saved-records').value = selectedId;
  selectReviewRecord();
}
function selectReviewRecord() {
  try {
    reviewRecord = $('saved-records').value ? records.get($('saved-records').value) : makeRecord(match, mode, '目前棋局');
    $('review-ply').max = reviewRecord.moves.length; $('review-ply').value = reviewRecord.cursor;
    $('review-jump').max = reviewRecord.moves.length;
    $('load-record').disabled = !$('saved-records').value;
    renderReview();
  } catch (error) { $('record-message').textContent = error.message; }
}
function renderReview() {
  try {
    const state = reviewPosition(reviewRecord, Number($('review-ply').value));
    $('review-label').textContent = positionLabel(state.ply);
    $('review-ply').setAttribute('aria-valuetext', positionLabel(state.ply));
    $('review-jump').value = state.ply;
    $('review-description').textContent = `${state.lastMove ? `剛走：${state.lastMove.from.toUpperCase()}${state.lastMove.capture ? '×' : '–'}${state.lastMove.to.toUpperCase()}。` : ''}${nextMoveLabel(state)}`;
    $('review-total').textContent = `棋譜共 ${state.totalPlies} 手${state.isRedoBranch ? ' · 此步位於悔棋後的重做分支' : ''}。雙方各走一手，合計一回合。`;
    $('review-board').replaceChildren();
    for (let row = 9; row >= 1; row--) for (const file of FILES) {
      const square = file + row, piece = state.board[square], cell = document.createElement('div');
      cell.className = `cell ${(FILES.indexOf(file) + row) % 2 ? 'dark' : ''} ${square === 'a1' ? 'base-blue' : square === 'i9' ? 'base-red' : ''} ${state.lastMove && [state.lastMove.from,state.lastMove.to].includes(square) ? 'last' : ''}`;
      cell.setAttribute('aria-label', `${square.toUpperCase()} ${piece ? COLORS[piece.side] + NAMES[piece.type] : '空格'}`);
      if (piece) { const token = document.createElement('span'); token.className = `piece ${piece.side}`; token.textContent = NAMES[piece.type]; cell.append(token); }
      const coordinate = document.createElement('span'); coordinate.className = 'coordinate'; coordinate.textContent = square.toUpperCase(); cell.append(coordinate);
      $('review-board').append(cell);
    }
    $('review-prev').disabled = state.ply === 0; $('review-next').disabled = state.ply === state.totalPlies;
  } catch (error) { $('record-message').textContent = error.message; }
}
$('records-button').onclick = () => {
  stopBot(); $('record-message').textContent = ''; $('records-dialog').showModal();
  try { showRecordList(); } catch (error) { $('record-message').textContent = error.message; }
  render();
};
$('records-dialog').addEventListener('close', () => scheduleBot());
$('save-record').onclick = () => {
  try { const record = persistCurrent($('record-name').value); showRecordList(record.id); $('record-message').textContent = '已儲存在此瀏覽器，關閉分頁後仍可讀取。'; }
  catch (error) { $('record-message').textContent = `儲存失敗：${error.message}`; }
};
$('saved-records').onchange = selectReviewRecord;
$('review-ply').oninput = renderReview;
$('review-go').onclick = () => {
  const ply = $('review-jump').valueAsNumber;
  if (!Number.isInteger(ply) || ply < 0 || ply > reviewRecord.moves.length) { $('record-message').textContent = `請輸入 0 到 ${reviewRecord.moves.length} 的整數手數。`; return; }
  $('record-message').textContent = ''; $('review-ply').value = ply; renderReview();
};
$('review-jump').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('review-go').click(); } };
$('review-prev').onclick = () => { $('review-ply').value = Number($('review-ply').value) - 1; renderReview(); };
$('review-next').onclick = () => { $('review-ply').value = Number($('review-ply').value) + 1; renderReview(); };
$('load-record').onclick = () => {
  try { loadRecord(records.get($('saved-records').value), match.id, match.revision); $('records-dialog').close(); toast('已載入戰役並暫停；原局已自動備份。'); }
  catch (error) { $('record-message').textContent = `載入失敗：${error.message}`; }
};
$('export-record').onclick = () => { if (reviewRecord) downloadRecord(reviewRecord); };
$('import-record').onclick = () => {
  try { const record = records.import($('import-json').value); showRecordList(record.id); $('record-message').textContent = '已匯入存檔；目前對局未變更。'; $('import-json').value = ''; }
  catch (error) { $('record-message').textContent = `匯入失敗：${error.message}`; }
};
$('import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 1000000) throw new Error('檔案不可超過 1 MB。'); const record = records.import(await file.text()); showRecordList(record.id); $('record-message').textContent = '已匯入存檔；目前對局未變更。'; }
  catch (error) { $('record-message').textContent = `匯入失敗：${error.message}`; }
  finally { event.target.value = ''; }
};
function assertInput(input, allowed, required = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('請提供 JSON 物件。');
  if (Object.keys(input).some(key => !allowed.includes(key)) || required.some(key => !(key in input))) throw new Error('缺少必要參數，或含有不支援的參數。');
}
const objectSchema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const squareSchema = { type: 'string', pattern: '^[a-i][1-9]$', description: 'Lowercase board coordinate, a1 to i9.' };
async function registerTools() {
  const context = document.modelContext ?? navigator.modelContext;
  if (!context?.registerTool) { connection = '此瀏覽器不支援 WebMCP，請在 Codex 內開啟。'; render(); return; }
  const lifecycle = new AbortController();
  const definitions = [
    { name: 'list_saved_games', title: '列出已儲存戰役', description: 'List saved local matches with recordId, name, opponent, currentPly and totalPlies. Does not change the active game.', inputSchema: objectSchema(), readOnly: true,
      action(input) { assertInput(input, []); return { records: records.list() }; } },
    { name: 'save_current_game', title: '儲存目前戰役', description: 'Save a new durable local snapshot of the active game, including its redo branch. Does not change the board. Optional name is plain text.', inputSchema: objectSchema({ name: { type: 'string', maxLength: 80 } }), readOnly: false,
      action(input) { assertInput(input, ['name']); if(input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 80)) throw new Error('名稱最多 80 字。'); return persistCurrent(input.name); } },
    { name: 'get_game_record', title: '讀取完整戰役棋譜', description: 'Read the active match or a saved record by recordId. Includes full legal replay moves, cursor, redo branch, humanSide and opponent. Does not change or load the active board.', inputSchema: objectSchema({ recordId: { type: 'string' } }), readOnly: true,
      action(input) { assertInput(input, ['recordId']); return { ...readTargetRecord(input.recordId), activeGameId: match.id, activeRevision: match.revision }; } },
    { name: 'get_review_position', title: '讀取指定步數復盤', description: 'Read position after ply moves (0 is initial), board, legal moves, prior/next move and history, for the active game or saved recordId. Read-only replay; never moves the active board. isRedoBranch marks undone future moves. Does not evaluate strategy.', inputSchema: objectSchema({ recordId: { type: 'string' }, ply: { type: 'integer', minimum: 0 } }, ['ply']), readOnly: true,
      action(input) { assertInput(input, ['recordId','ply'], ['ply']); return { ...reviewPosition(readTargetRecord(input.recordId), input.ply), activeGameId: match.id, activeRevision: match.revision }; } },
    { name: 'load_saved_game', title: '載入戰役續下', description: 'Replace active board with saved recordId for continuation. Back up the active match first, use a new gameId, pause the strategy engine. Requires current gameId and expectedRevision. Use read-only review tools for analysis without replacing the board.', inputSchema: objectSchema({ recordId: { type: 'string' }, gameId: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 } }, ['recordId','gameId','expectedRevision']), readOnly: false,
      action(input) { assertInput(input, ['recordId','gameId','expectedRevision'], ['recordId','gameId','expectedRevision']); if($('new-dialog').open)throw new Error('正在設定新局，請稍後再載入。'); return loadRecord(records.get(input.recordId), input.gameId, input.expectedRevision); } },
    { name: 'get_game_state', title: '讀取對戰棋局', description: 'Read this Intransitive practice match, current turn, full board, move history, legal moves, gameId and revision. The human moves through the board; the agent may move only agentSide. No external data is accessed.', inputSchema: objectSchema(), readOnly: true,
      action(input) { assertInput(input, []); return { ...match.snapshot(), opponent:mode, thinking, paused, engineAnalysis:analysis, rules: { board: '9x9; a1 lower left', bases: BASES, move: 'one square in any direction', captures: { R: 'S', S: 'P', P: 'R' }, win: 'reach opposing base, eliminate enemy or leave them no legal moves', draw: '200 consecutive plies without a capture' } }; } },
    { name: 'get_legal_moves', title: '列出合法走法', description: 'List legal moves for the current turn, optionally restricted to one source square. Returns current gameId and revision. This does not make a move.', inputSchema: objectSchema({ from: squareSchema }), readOnly: true,
      action(input) { assertInput(input, ['from']); if (input.from !== undefined && !isSquare(input.from)) throw new Error('from 須為 a1 到 i9。'); return { gameId: match.id, revision: match.revision, turn: match.position.turn, moves: legalMoves(match.position).filter(move => !input.from || move.from === input.from) }; } },
    { name: 'play_move', title: '替 Codex 落子', description: 'In codex opponent mode only, commit one legal move for agentSide and update board and history. Read get_game_state first, then pass gameId and revision as expectedRevision. Rejects automatic-engine mode, stale state, human turns and finished matches.',
      inputSchema: objectSchema({ gameId: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 }, from: squareSchema, to: squareSchema }, ['gameId', 'expectedRevision', 'from', 'to']), readOnly: false,
      action(input) { assertInput(input, ['gameId', 'expectedRevision', 'from', 'to'], ['gameId', 'expectedRevision', 'from', 'to']); if(mode!=='codex')throw new Error('目前是自動引擎模式；請先在頁面切換為 Codex 對戰。'); if (typeof input.gameId !== 'string' || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('gameId 或 expectedRevision 無效。'); if ($('new-dialog').open) throw new Error('玩家正在設定新局，請稍後再讀盤。'); match.move({ ...input, actor: 'agent' }); changed(); return match.snapshot(); } }
  ];
  try {
    for (const tool of definitions) await context.registerTool({ name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: tool.readOnly, untrustedContentHint: false }, execute(input) {
        try {
          const result = tool.action(input); connected = true; connection = 'Codex 已透過 WebMCP 連線'; render();
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
      } }, { signal: lifecycle.signal });
    connection = '對戰工具已就緒，等待 Codex 連線'; render();
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
    window.addEventListener('pageshow', event => { if (event.persisted) { connected = false; registerTools(); } });
  } catch (error) { lifecycle.abort(); connection = `WebMCP 未能啟用：${error.message}`; render(); }
}
window.addEventListener('pagehide',()=>stopBot());
window.addEventListener('pageshow',event=>{if(event.persisted)scheduleBot();});
render(); registerTools(); scheduleBot();
if (storageWarning) toast('無法還原先前棋局，已開啟新局。');
