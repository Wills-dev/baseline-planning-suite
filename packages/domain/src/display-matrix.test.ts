import { expect, test } from 'vitest';
import { reconcileRoundedMatrixUnits } from './display-matrix';
import { reconcileRoundedUnits } from './display-rounding';

test('matrix preserves fixed monthly margins, largest-remainder row totals, and stable ties', () => {
  const matrix = [
    [0.004, 0.004],
    [0.004, 0.004],
  ];
  expect(reconcileRoundedMatrixUnits(matrix, 2, [1, 1])).toEqual([
    [1, 0],
    [0, 1],
  ]);
  expect(matrix).toEqual([
    [0.004, 0.004],
    [0.004, 0.004],
  ]);
});
test('conflicting independent row/month margins use feasible floor/ceiling totals, never move units into exact zero cells', () => {
  expect(
    reconcileRoundedMatrixUnits(
      [
        [0.006, 0],
        [0, 0.006],
      ],
      2,
      [0, 1],
    ),
  ).toEqual([
    [0, 0],
    [0, 1],
  ]);
});
test('controlled rounding conserves both dimensions across deterministic fractional matrices', () => {
  for (let seed = 1; seed <= 250; seed++) {
    const matrix = Array.from({ length: 6 }, (_, row) =>
      Array.from(
        { length: 12 },
        (_, column) => ((seed * 31 + row * 73 + column * 29) % 101) / 10000,
      ),
    );
    const columns = reconcileRoundedUnits(
      matrix[0]!.map((_, index) =>
        matrix.reduce((sum, row) => sum + row[index]!, 0),
      ),
      2,
    );
    const rounded = reconcileRoundedMatrixUnits(matrix, 2, columns);
    expect(rounded).toEqual(reconcileRoundedMatrixUnits(matrix, 2, columns));
    columns.forEach((value, column) =>
      expect(rounded.reduce((sum, row) => sum + row[column]!, 0)).toBe(value),
    );
    matrix.forEach((row, index) => {
      const exact = row.reduce((sum, value) => sum + value, 0) * 100;
      const total = rounded[index]!.reduce((sum, value) => sum + value, 0);
      expect(Math.abs(total - exact)).toBeLessThan(1.0000000001);
      row.forEach((value, column) =>
        expect(Math.abs(rounded[index]![column]! - value * 100)).toBeLessThan(
          1.0000000001,
        ),
      );
    });
  }
});
