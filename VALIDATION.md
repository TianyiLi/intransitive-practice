# Verification — 2026-09-16

- Node built-in test runner: 21 rule, search, cancellation and record tests pass. JavaScript syntax checks pass.
- Local server: HTTP 200 at http://127.0.0.1:4318/ ; serves only the explicit web-asset allowlist on loopback.
- Codex in-app browser discovered all three native WebMCP tools with their intended schemas and read-only annotations.
- get_game_state returned initial 20-piece board, blue turn, game ID, revision and legal moves.
- get_legal_moves({from:"d4"}) returned d5/e4/e5. Invalid z9 intentionally failed.
- get_game_state with an unexpected key intentionally failed.
- play_move on the human turn failed without changing the board.
- UI D4–E5 changed turn to red. Old revision 0 and illegal F6–F4 each failed.
- Native WebMCP play_move F6–F5 at revision 1 succeeded; visible history showed both plies, turn returned to blue.
- UI undo returned to red's turn; redo restored both moves. Reload preserved both moves.
- Browser console reported no errors during those checks. Desktop screenshot reviewed.

Video transcript was unavailable. No claim of full official-server parity or video-strategy verification. Mobile CSS is included; no mobile viewport screenshot was taken.

The local server is retained in tmux session `rps-practice-4318` for continued play. It is not a public deployment.

## Strategy engine and match records

- Easy and medium automatically replied after UI D4–E5; medium completed 3 plies.
- Hard now evaluates victory conditions, not capture sequences as the primary objective. Its current browser opening completed depth 4 in 1.60 seconds; depth 5 is the configured maximum, not a promise for every position.
- A tactical test exhaustively checks every opponent reply to verify hard chooses a forced base plan over an available capture. Additional tests cover immobilization victory and route estimates that avoid hostile control.
- All 160 seeded rule-parity positions passed; poisoned capture, immediate win/defense, time-limit fallback and immutable inputs passed.
- Background worker cancellation rejects stale, duplicate and superseded messages; error paths clean up workers. Browser pause/resume, undo/redo and reload persistence worked.
- Choosing the human as red triggered an automatic blue opening. Codex mode remained usable through native play_move; automatic-engine mode rejected that tool.
- Eight native WebMCP tools registered, including durable save/list/load and read-only record/review tools.
- Saved the user's completed medium game: 45 plies, blue won by reaching I9. Retrieved ply 1 through the review tool and navigated UI previous/next; active game snapshot, identity and revision remained identical.
- A stale load revision was rejected. A valid saved game was loaded in a separate validation tab: same 45-ply final position, new game identity, paused engine, and automatic backup of the replaced game. The user's training tab remained unchanged.
- Record tests verify legal replay on import, legacy import, redo preservation, corrupt data rejection, quota errors and independent snapshots.
- Reviewed the actual replay dialog screenshot; its board, move slider, save/load controls and import section rendered clearly. Browser error logs were empty.

No Elo calibration or claim of optimal strategy. Route estimates assume static opponents between searched moves. Local saved records are not a cloud backup. File-picker download/upload round trip was not browser-automated; the underlying JSON import/export representation was round-trip tested.
