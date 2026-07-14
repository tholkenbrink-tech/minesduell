import type { Board, Cell, Position } from './types';
import { mulberry32, shuffled, type Rng } from './rng';

export function inBounds(board: Pick<Board, 'width' | 'height'>, pos: Position): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < board.width && pos.y < board.height;
}

export function neighbors(board: Pick<Board, 'width' | 'height'>, pos: Position): Position[] {
  const out: Position[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = { x: pos.x + dx, y: pos.y + dy };
      if (inBounds(board, n)) out.push(n);
    }
  }
  return out;
}

function emptyCell(): Cell {
  return { mine: false, revealed: false, flagged: false, adjacent: 0 };
}

/** Creates an empty (mine-less, ungenerated) board shell. Mines are placed on first reveal. */
export function createEmptyBoard(width: number, height: number, mineCount: number, seed: number): Board {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) row.push(emptyCell());
    cells.push(row);
  }
  return { width, height, mineCount, seed, cells, generated: false };
}

/**
 * Maximum number of mines that can exist while still honoring the first-reveal
 * safe-zone rule (the clicked cell + its up-to-8 neighbors must be mine-free).
 */
export function maxMinesForSafeFirstReveal(width: number, height: number, safeZoneSize = 9): number {
  const totalCells = width * height;
  return Math.max(0, totalCells - Math.min(safeZoneSize, totalCells));
}

export function validateBoardConfig(
  width: number,
  height: number,
  mines: number,
): { valid: boolean; reason?: string; maxMines: number } {
  const totalCells = width * height;
  const maxMines = maxMinesForSafeFirstReveal(width, height);
  if (width < 6 || height < 6) {
    return { valid: false, reason: 'Board must be at least 6x6.', maxMines };
  }
  if (width > 50 || height > 50) {
    return { valid: false, reason: 'Board cannot exceed 50x50.', maxMines };
  }
  if (mines < 1) {
    return { valid: false, reason: 'At least 1 mine is required.', maxMines };
  }
  if (mines > maxMines) {
    return {
      valid: false,
      reason: `Too many mines: max ${maxMines} for a ${width}x${height} board with a safe first reveal.`,
      maxMines,
    };
  }
  if (mines >= totalCells) {
    return { valid: false, reason: 'Mine count must be less than total cell count.', maxMines };
  }
  return { valid: true, maxMines };
}

/**
 * Places mines deterministically from the board's seed, excluding the safe
 * zone around `firstClick`. Mutates and returns the same board reference for
 * call-site convenience; callers should treat boards as otherwise immutable.
 */
export function generateBoard(board: Board, firstClick: Position): Board {
  if (board.generated) return board;
  const rng: Rng = mulberry32(board.seed);
  const safeZone = new Set<string>([`${firstClick.x},${firstClick.y}`]);
  for (const n of neighbors(board, firstClick)) safeZone.add(`${n.x},${n.y}`);

  const candidates: Position[] = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (!safeZone.has(`${x},${y}`)) candidates.push({ x, y });
    }
  }

  const picked = shuffled(candidates, rng).slice(0, board.mineCount);
  for (const p of picked) {
    board.cells[p.y][p.x].mine = true;
  }

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const cell = board.cells[y][x];
      if (cell.mine) continue;
      cell.adjacent = neighbors(board, { x, y }).filter((n) => board.cells[n.y][n.x].mine).length;
    }
  }

  board.generated = true;
  return board;
}

export function cloneBoard(board: Board): Board {
  return {
    ...board,
    cells: board.cells.map((row) => row.map((cell) => ({ ...cell }))),
  };
}

/**
 * Mines still "in play" — i.e. neither correctly flagged nor already revealed.
 * A mine that was revealed by a mistaken click is out of the equation: it can
 * never be flagged again, so it no longer counts toward the mines left to find.
 */
export function countRemainingMines(board: Board): number {
  let resolved = 0;
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.mine && (cell.flagged || cell.revealed)) resolved++;
    }
  }
  return board.mineCount - resolved;
}

export function isBoardFullyRevealed(board: Board): boolean {
  for (const row of board.cells) {
    for (const cell of row) {
      if (!cell.mine && !cell.revealed) return false;
    }
  }
  return true;
}

/**
 * True when every mine has been resolved — either correctly flagged or
 * revealed by a mistaken click. A revealed mine can never be flagged again, so
 * it MUST count as resolved; otherwise a flag-all-mines game/race could never
 * be completed after a single error. Mistakes are permanent, but they must not
 * make the board impossible to finish.
 */
export function areAllMinesResolved(board: Board): boolean {
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.mine && !cell.flagged && !cell.revealed) return false;
    }
  }
  return true;
}

export function countMinesFlagged(board: Board): number {
  let n = 0;
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.mine && cell.flagged) n++;
    }
  }
  return n;
}
