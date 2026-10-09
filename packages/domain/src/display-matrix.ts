import { displayScale, reconcileRoundedUnits } from './display-rounding.js';

interface Edge {
  to: number;
  reverse: number;
  capacity: number;
  initial: number;
}

/** Controlled display rounding with fixed column margins. Largest-remainder row
 * targets are preferred; when those margins conflict, floor/ceiling row margins
 * are chosen subject to conservation. Stable remainder order breaks ties.
 */
export function reconcileRoundedMatrixUnits(
  values: readonly (readonly number[])[],
  decimalPlaces: number,
  columnUnits: readonly number[],
): number[][] {
  const scale = displayScale(decimalPlaces);
  if (values.some((row) => row.length !== columnUnits.length))
    throw new RangeError('Display matrix dimensions differ.');
  function normalize(number: number): number {
    const nearest = Math.round(number);
    return Math.abs(number - nearest) <=
      Math.min(1e-7, Number.EPSILON * Math.max(1, number) * 4)
      ? nearest
      : number;
  }
  function remainderOrder(
    a: number,
    b: number,
    left: number,
    right: number,
  ): number {
    const difference = b - Math.floor(b) - (a - Math.floor(a));
    const allowance = Math.min(1e-7, Number.EPSILON * Math.max(1, a, b) * 4);
    return Math.abs(difference) <= allowance ? left - right : difference;
  }
  const scaled = values.map((row) =>
    row.map((value) => {
      // Reuse validation and the existing floating-point allowance.
      reconcileRoundedUnits([value], decimalPlaces);
      const number = value * scale;
      return normalize(number);
    }),
  );
  const base = scaled.map((row) => row.map(Math.floor));
  const exactRows = values.map((row) =>
    row.reduce((sum, value) => sum + value, 0),
  );
  const preferred = reconcileRoundedUnits(
    exactRows,
    decimalPlaces,
    columnUnits.reduce((sum, value) => sum + value, 0),
  );
  const rowBases = base.map((row) =>
    row.reduce((sum, value) => sum + value, 0),
  );
  const columns = columnUnits.map(
    (target, index) => target - base.reduce((sum, row) => sum + row[index]!, 0),
  );
  if (columns.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new RangeError('Invalid display column target.');

  function solve(flexible: boolean): number[][] | undefined {
    const source = values.length + columnUnits.length;
    const sink = source + 1,
      superSource = sink + 1,
      superSink = superSource + 1;
    const graph: Edge[][] = Array.from({ length: superSink + 1 }, () => []);
    const balance = graph.map(() => 0);
    function edge(
      from: number,
      to: number,
      lower: number,
      upper: number,
    ): Edge {
      const forward = {
        to,
        reverse: graph[to]!.length,
        capacity: upper - lower,
        initial: upper - lower,
      };
      const backward = {
        to: from,
        reverse: graph[from]!.length,
        capacity: 0,
        initial: 0,
      };
      graph[from]!.push(forward);
      graph[to]!.push(backward);
      balance[from]! -= lower;
      balance[to]! += lower;
      return forward;
    }
    const rowOrder = reconcileRoundedUnits(exactRows, decimalPlaces)
      .map((_, index) => index)
      .sort((left, right) => {
        const a = exactRows[left]! * scale,
          b = exactRows[right]! * scale;
        return remainderOrder(a, b, left, right);
      });
    for (const row of rowOrder) {
      const exact = normalize(
        scaled[row]!.reduce((sum, value) => sum + value, 0),
      );
      const target = preferred[row]! - rowBases[row]!;
      edge(
        source,
        row,
        flexible ? Math.floor(exact) - rowBases[row]! : target,
        flexible ? Math.ceil(exact) - rowBases[row]! : target,
      );
    }
    const cells: { row: number; column: number; edge: Edge }[] = [];
    for (const [row, numbers] of scaled.entries()) {
      const order = numbers
        .map((value, column) => ({
          column,
          remainder: value - Math.floor(value),
        }))
        .filter((item) => item.remainder > 0)
        .sort((a, b) =>
          remainderOrder(
            numbers[a.column]!,
            numbers[b.column]!,
            a.column,
            b.column,
          ),
        );
      for (const { column } of order)
        cells.push({
          row,
          column,
          edge: edge(row, values.length + column, 0, 1),
        });
    }
    columns.forEach((target, index) =>
      edge(values.length + index, sink, target, target),
    );
    const remaining = columns.reduce((sum, value) => sum + value, 0);
    edge(sink, source, remaining, remaining);
    let required = 0;
    balance.forEach((value, vertex) => {
      if (value > 0) {
        edge(superSource, vertex, 0, value);
        required += value;
      } else if (value < 0) edge(vertex, superSink, 0, -value);
    });
    let sent = 0;
    while (sent < required) {
      const previous: ({ vertex: number; edge: Edge } | undefined)[] =
        graph.map(() => undefined);
      const queue = [superSource];
      const visited = new Set(queue);
      for (
        let position = 0;
        position < queue.length && !visited.has(superSink);
        position++
      ) {
        const vertex = queue[position]!;
        for (const candidate of graph[vertex]!) {
          if (candidate.capacity > 0 && !visited.has(candidate.to)) {
            visited.add(candidate.to);
            previous[candidate.to] = { vertex, edge: candidate };
            queue.push(candidate.to);
          }
        }
      }
      if (!visited.has(superSink)) return undefined;
      let amount = required - sent;
      for (
        let vertex = superSink;
        vertex !== superSource;
        vertex = previous[vertex]!.vertex
      )
        amount = Math.min(amount, previous[vertex]!.edge.capacity);
      for (
        let vertex = superSink;
        vertex !== superSource;
        vertex = previous[vertex]!.vertex
      ) {
        const entry = previous[vertex]!;
        entry.edge.capacity -= amount;
        graph[vertex]![entry.edge.reverse]!.capacity += amount;
      }
      sent += amount;
    }
    const result = base.map((row) => [...row]);
    for (const cell of cells)
      result[cell.row]![cell.column]! += cell.edge.initial - cell.edge.capacity;
    return result;
  }
  const result = solve(false) ?? solve(true);
  if (!result)
    throw new RangeError('Display matrix margins cannot be reconciled.');
  return result;
}
