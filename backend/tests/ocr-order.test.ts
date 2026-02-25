import { describe, expect, it } from 'vitest';
import { orderOcrLines } from '../src/services/ocrOrder.js';

interface TestLine {
  id: string;
  text: string;
  box: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

function createLine(
  id: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number
): TestLine {
  return {
    id,
    text,
    box: { x, y, w, h },
  };
}

describe('orderOcrLines', () => {
  it('sorts horizontal text top-to-bottom and left-to-right', () => {
    const lines: TestLine[] = [
      createLine('b', '第一行右', 0.52, 0.1, 0.4, 0.05),
      createLine('c', '第二行', 0.12, 0.22, 0.55, 0.05),
      createLine('a', '第一行左', 0.08, 0.1, 0.35, 0.05),
    ];

    const ordered = orderOcrLines(lines);

    expect(ordered.direction).toBe('horizontal');
    expect(ordered.lines.map((line) => line.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts vertical text columns right-to-left and top-to-bottom', () => {
    const lines: TestLine[] = [
      createLine('l2', '左下', 0.58, 0.44, 0.06, 0.28),
      createLine('r2', '右下', 0.78, 0.44, 0.06, 0.28),
      createLine('l1', '左上', 0.58, 0.1, 0.06, 0.28),
      createLine('r1', '右上', 0.78, 0.1, 0.06, 0.28),
    ];

    const ordered = orderOcrLines(lines);

    expect(ordered.direction).toBe('vertical-rtl');
    expect(ordered.lines.map((line) => line.id)).toEqual(['r1', 'r2', 'l1', 'l2']);
  });

  it('keeps slightly noisy y-values in the same horizontal row', () => {
    const lines: TestLine[] = [
      createLine('b', '同一行右', 0.43, 0.123, 0.4, 0.05),
      createLine('a', '同一行左', 0.1, 0.1, 0.32, 0.05),
      createLine('c', '下一行', 0.1, 0.26, 0.35, 0.05),
    ];

    const ordered = orderOcrLines(lines);

    expect(ordered.direction).toBe('horizontal');
    expect(ordered.lines.map((line) => line.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves input order for exact geometric ties', () => {
    const lines: TestLine[] = [
      createLine('one', '甲', 0.2, 0.2, 0.1, 0.1),
      createLine('two', '乙', 0.2, 0.2, 0.1, 0.1),
      createLine('three', '丙', 0.2, 0.2, 0.1, 0.1),
    ];

    const ordered = orderOcrLines(lines);

    expect(ordered.direction).toBe('horizontal');
    expect(ordered.lines.map((line) => line.id)).toEqual(['one', 'two', 'three']);
  });
});
