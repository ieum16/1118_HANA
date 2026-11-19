function edgeKey(row, col) {
  return row + "," + col;
}

function cellEdges(row, col) {
  return [
    edgeKey(2 * row, 2 * col + 1),
    edgeKey(2 * row + 2, 2 * col + 1),
    edgeKey(2 * row + 1, 2 * col),
    edgeKey(2 * row + 1, 2 * col + 2)
  ];
}

function isSingleLoop(lines) {
  const neighbors = new Map();
  function connect(from, to) {
    if (!neighbors.has(from)) neighbors.set(from, []);
    neighbors.get(from).push(to);
  }
  for (const edge of lines) {
    const [row, col] = edge.split(",").map(Number);
    const vertical = row % 2 === 1;
    const a = edgeKey(row - Number(vertical), col - Number(!vertical));
    const b = edgeKey(row + Number(vertical), col + Number(!vertical));
    connect(a, b);
    connect(b, a);
  }
  if (!neighbors.size || [...neighbors.values()].some(adjacent => adjacent.length !== 2)) return false;

  const stack = [neighbors.keys().next().value];
  const visited = new Set();
  while (stack.length) {
    const vertex = stack.pop();
    if (visited.has(vertex)) continue;
    visited.add(vertex);
    stack.push(...neighbors.get(vertex));
  }
  return visited.size === neighbors.size;
}

function generatePuzzle(size) {
  const lines = new Set();
  const top = Array.from({ length: size }, () => Math.floor(Math.random() * Math.floor(size / 2)));
  const bottom = Array.from({ length: size }, () => Math.floor(size / 2) + Math.floor(Math.random() * (size - Math.floor(size / 2))));
  // Every column overlaps the middle row. Shared edges cancel, leaving one boundary.
  for (let col = 0; col < size; col++) {
    for (let row = top[col]; row <= bottom[col]; row++) {
      for (const edge of cellEdges(row, col)) {
        if (!lines.delete(edge)) lines.add(edge);
      }
    }
  }
  const clues = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => cellEdges(row, col).filter(edge => lines.has(edge)).length)
  );
  return { clues, lines };
}

function matchesClues(clues, lines) {
  return clues.every((cells, row) => cells.every((count, col) =>
    cellEdges(row, col).filter(edge => lines.has(edge)).length === count
  ));
}
