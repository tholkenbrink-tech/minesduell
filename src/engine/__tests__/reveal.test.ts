import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../board';
import { revealCell, toggleFlag, chord } from '../reveal';

describe('reveal + flag rules', () => {
  it('reveals a safe cell and generates the board on first reveal', () => {
    const board = createEmptyBoard(8, 8, 5, 99);
    expect(board.generated).toBe(false);
    const result = revealCell(board, { x: 3, y: 3 }, 'p1');
    expect(board.generated).toBe(true);
    expect(result.hitMine).toBe(false);
    expect(board.cells[3][3].revealed).toBe(true);
  });

  it('recursively reveals a connected zero region and its numbered boundary', () => {
    // 3x3 board with a single mine tucked in the corner guarantees a large
    // zero region opens from the opposite corner.
    const board = createEmptyBoard(5, 5, 1, 123);
    const result = revealCell(board, { x: 4, y: 4 }, 'p1');
    expect(result.hitMine).toBe(false);
    const revealedCount = board.cells.flat().filter((c) => c.revealed).length;
    expect(revealedCount).toBeGreaterThan(1);
  });

  it('reveals a mine and does not cascade', () => {
    const board = createEmptyBoard(4, 4, 1, 5);
    board.generated = true;
    board.cells[1][1].mine = true;
    const result = revealCell(board, { x: 1, y: 1 }, 'p1');
    expect(result.hitMine).toBe(true);
    expect(board.cells[1][1].revealed).toBe(true);
  });

  it('does not reveal a flagged cell', () => {
    const board = createEmptyBoard(6, 6, 3, 5);
    board.generated = true;
    toggleFlag(board, { x: 2, y: 2 }, 'p1');
    const result = revealCell(board, { x: 2, y: 2 }, 'p1');
    expect(board.cells[2][2].revealed).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('correctly flags a mine and reports it as correct', () => {
    const board = createEmptyBoard(6, 6, 3, 5);
    board.generated = true;
    board.cells[0][0].mine = true;
    const result = toggleFlag(board, { x: 0, y: 0 }, 'p1');
    expect(result.correct).toBe(true);
    expect(board.cells[0][0].flagged).toBe(true);
    expect(board.cells[0][0].flaggedBy).toBe('p1');
  });

  it('incorrectly flags a safe cell and reports it as incorrect', () => {
    const board = createEmptyBoard(6, 6, 3, 5);
    board.generated = true;
    const result = toggleFlag(board, { x: 0, y: 0 }, 'p1');
    expect(result.correct).toBe(false);
  });

  it('removing a flag reports correct=null and does not re-score', () => {
    const board = createEmptyBoard(6, 6, 3, 5);
    board.generated = true;
    board.cells[0][0].mine = true;
    toggleFlag(board, { x: 0, y: 0 }, 'p1');
    const removed = toggleFlag(board, { x: 0, y: 0 }, 'p1');
    expect(removed.correct).toBeNull();
    expect(board.cells[0][0].flagged).toBe(false);
  });

  it('a revealed cell cannot be flagged', () => {
    const board = createEmptyBoard(6, 6, 0, 5);
    board.generated = true;
    revealCell(board, { x: 0, y: 0 }, 'p1');
    const result = toggleFlag(board, { x: 0, y: 0 }, 'p1');
    expect(board.cells[0][0].flagged).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('chords: reveals remaining neighbors once flag count matches the number', () => {
    const board = createEmptyBoard(3, 3, 1, 5);
    board.generated = true;
    board.cells[0][0].mine = true;
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        if (!board.cells[y][x].mine) {
          board.cells[y][x].adjacent = [
            [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
          ].filter(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            return nx >= 0 && ny >= 0 && nx < 3 && ny < 3 && board.cells[ny][nx].mine;
          }).length;
        }
      }
    board.cells[1][1].revealed = true; // the "1" tile diagonally adjacent to the mine
    toggleFlag(board, { x: 0, y: 0 }, 'p1');
    const result = chord(board, { x: 1, y: 1 }, 'p1');
    expect(result.hitMine).toBe(false);
    expect(board.cells[0][1].revealed).toBe(true);
    expect(board.cells[1][0].revealed).toBe(true);
  });
});
