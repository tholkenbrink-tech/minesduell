import { describe, expect, it } from 'vitest';
import { createEmptyBoard, generateBoard, maxMinesForSafeFirstReveal, validateBoardConfig, neighbors } from '../board';
import { hashSeed } from '../rng';

describe('board generation', () => {
  it('produces the same mine layout for the same seed and first click', () => {
    const seed = hashSeed('race-seed-1');
    const a = generateBoard(createEmptyBoard(12, 16, 30, seed), { x: 5, y: 5 });
    const b = generateBoard(createEmptyBoard(12, 16, 30, seed), { x: 5, y: 5 });

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 12; x++) {
        expect(a.cells[y][x].mine).toBe(b.cells[y][x].mine);
        expect(a.cells[y][x].adjacent).toBe(b.cells[y][x].adjacent);
      }
    }
  });

  it('produces a different layout for a different seed', () => {
    const a = generateBoard(createEmptyBoard(12, 16, 30, 1), { x: 5, y: 5 });
    const b = generateBoard(createEmptyBoard(12, 16, 30, 2), { x: 5, y: 5 });
    let differs = false;
    for (let y = 0; y < 16 && !differs; y++) {
      for (let x = 0; x < 12; x++) {
        if (a.cells[y][x].mine !== b.cells[y][x].mine) {
          differs = true;
          break;
        }
      }
    }
    expect(differs).toBe(true);
  });

  it('places exactly mineCount mines', () => {
    const board = generateBoard(createEmptyBoard(16, 16, 40, 42), { x: 0, y: 0 });
    let count = 0;
    for (const row of board.cells) for (const c of row) if (c.mine) count++;
    expect(count).toBe(40);
  });

  it('keeps the first-clicked cell and its neighbors mine-free', () => {
    const board = generateBoard(createEmptyBoard(10, 10, 50, 7), { x: 4, y: 4 });
    expect(board.cells[4][4].mine).toBe(false);
    for (const n of neighbors(board, { x: 4, y: 4 })) {
      expect(board.cells[n.y][n.x].mine).toBe(false);
    }
  });

  it('computes correct adjacency counts', () => {
    const board = createEmptyBoard(3, 3, 0, 1);
    board.cells[0][0].mine = true;
    board.generated = true;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const cell = board.cells[y][x];
        if (cell.mine) continue;
        cell.adjacent = neighbors(board, { x, y }).filter((n) => board.cells[n.y][n.x].mine).length;
      }
    }
    expect(board.cells[0][1].adjacent).toBe(1);
    expect(board.cells[1][1].adjacent).toBe(1);
    expect(board.cells[2][2].adjacent).toBe(0);
  });

  it('validates board configs against the safe-first-reveal maximum', () => {
    const max = maxMinesForSafeFirstReveal(6, 6);
    expect(validateBoardConfig(6, 6, max).valid).toBe(true);
    expect(validateBoardConfig(6, 6, max + 1).valid).toBe(false);
    expect(validateBoardConfig(5, 5, 5).valid).toBe(false); // below minimum size
    expect(validateBoardConfig(51, 20, 10).valid).toBe(false); // above maximum size
  });
});
