import type { Board, GameEvent, Position } from './types';
import { generateBoard, neighbors } from './board';

export interface RevealResult {
  board: Board;
  events: GameEvent[];
  newlyRevealedSafe: Position[];
  hitMine: boolean;
}

/**
 * Reveals a cell. Generates the board on first call so the safe-first-reveal
 * rule can exclude the clicked cell's neighborhood from mine placement.
 * Flagged and already-revealed cells are no-ops.
 */
export function revealCell(board: Board, pos: Position, playerId?: string): RevealResult {
  if (!board.generated) {
    generateBoard(board, pos);
  }
  const cell = board.cells[pos.y][pos.x];
  const events: GameEvent[] = [];

  if (cell.flagged || cell.revealed) {
    return { board, events, newlyRevealedSafe: [], hitMine: false };
  }

  if (cell.mine) {
    cell.revealed = true;
    cell.revealedBy = playerId;
    events.push({ type: 'MINE_REVEALED', playerId, position: pos });
    return { board, events, newlyRevealedSafe: [], hitMine: true };
  }

  cell.revealed = true;
  cell.revealedBy = playerId;
  events.push({ type: 'SAFE_CELL_REVEALED', playerId, position: pos });
  const newlyRevealed: Position[] = [pos];

  if (cell.adjacent === 0) {
    const expanded = floodReveal(board, pos, playerId);
    newlyRevealed.push(...expanded);
    if (expanded.length > 0) {
      events.push({
        type: 'ZERO_REGION_EXPANDED',
        playerId,
        position: pos,
        data: { count: expanded.length },
      });
    }
  }

  return { board, events, newlyRevealedSafe: newlyRevealed, hitMine: false };
}

/** BFS flood-fill: reveals the connected zero region and its numbered boundary. */
function floodReveal(board: Board, start: Position, playerId?: string): Position[] {
  const revealed: Position[] = [];
  const visited = new Set<string>([`${start.x},${start.y}`]);
  const queue: Position[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentCell = board.cells[current.y][current.x];
    if (currentCell.adjacent !== 0) continue;

    for (const n of neighbors(board, current)) {
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const nCell = board.cells[n.y][n.x];
      if (nCell.mine || nCell.flagged || nCell.revealed) continue;
      nCell.revealed = true;
      nCell.revealedBy = playerId;
      revealed.push(n);
      if (nCell.adjacent === 0) queue.push(n);
    }
  }

  return revealed;
}

export interface FlagResult {
  board: Board;
  events: GameEvent[];
  correct: boolean | null; // null = flag removed, not a new flag
}

/** Toggles a flag. Revealed cells cannot be flagged. */
export function toggleFlag(board: Board, pos: Position, playerId?: string): FlagResult {
  const cell = board.cells[pos.y][pos.x];
  const events: GameEvent[] = [];

  if (cell.revealed) {
    return { board, events, correct: null };
  }

  if (cell.flagged) {
    cell.flagged = false;
    cell.flaggedBy = undefined;
    events.push({ type: 'FLAG_REMOVED', playerId, position: pos });
    return { board, events, correct: null };
  }

  cell.flagged = true;
  cell.flaggedBy = playerId;
  if (cell.mine) {
    events.push({ type: 'MINE_CORRECTLY_FLAGGED', playerId, position: pos });
    return { board, events, correct: true };
  }
  events.push({ type: 'SAFE_CELL_INCORRECTLY_FLAGGED', playerId, position: pos });
  return { board, events, correct: false };
}

/**
 * Chording: reveals all hidden neighbors of an already-revealed numbered cell
 * when the number of adjacent flags matches its adjacent-mine count.
 */
export function chord(board: Board, pos: Position, playerId?: string): RevealResult {
  const cell = board.cells[pos.y][pos.x];
  const events: GameEvent[] = [];
  const newlyRevealedSafe: Position[] = [];
  let hitMine = false;

  if (!cell.revealed || cell.adjacent === 0) {
    return { board, events, newlyRevealedSafe, hitMine };
  }

  const ns = neighbors(board, pos);
  const flaggedCount = ns.filter((n) => board.cells[n.y][n.x].flagged).length;
  if (flaggedCount !== cell.adjacent) {
    return { board, events, newlyRevealedSafe, hitMine };
  }

  for (const n of ns) {
    const nCell = board.cells[n.y][n.x];
    if (nCell.revealed || nCell.flagged) continue;
    const result = revealCell(board, n, playerId);
    events.push(...result.events);
    newlyRevealedSafe.push(...result.newlyRevealedSafe);
    if (result.hitMine) hitMine = true;
  }

  return { board, events, newlyRevealedSafe, hitMine };
}
