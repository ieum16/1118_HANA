const board = document.querySelector("#board");
const sizeInput = document.querySelector("#size");
const result = document.querySelector("#result");

let clues;
let lines = new Set();

function draw() {
  result.textContent = "";
  lines = new Set();
  const size = clues.length;
  const tracks = "repeat(" + size + ", 16px minmax(0, 1fr)) 16px";
  board.style.gridTemplateColumns = tracks;
  board.style.gridTemplateRows = tracks;
  const fragment = document.createDocumentFragment();
  for (let row = 0; row <= size * 2; row++) {
    for (let col = 0; col <= size * 2; col++) {
      const oddRow = row % 2 === 1;
      const oddCol = col % 2 === 1;
      if (oddRow !== oddCol) {
        const edge = document.createElement("button");
        edge.type = "button";
        edge.className = oddRow ? "edge vertical" : "edge";
        const id = edgeKey(row, col);
        function setState(state) {
          edge.dataset.state = state;
          if (state === 1) lines.add(id);
          else lines.delete(id);
          const direction = oddRow ? "세로" : "가로";
          const label = ["빈칸", "선", "제외"][state];
          edge.setAttribute("aria-label", (Math.floor(row / 2) + 1) + "행 "
            + (Math.floor(col / 2) + 1) + "열 " + direction + " 변, " + label);
          result.textContent = "";
        }

        setState(0);
        edge.addEventListener("click", () => setState((Number(edge.dataset.state) + 1) % 3));
        edge.addEventListener("contextmenu", event => {
          event.preventDefault();
          setState(edge.dataset.state === "2" ? 0 : 2);
        });
        fragment.append(edge);
        continue;
      }
      const tile = document.createElement("div");
      tile.className = oddRow ? "clue" : "dot";
      if (oddRow) tile.textContent = clues[Math.floor(row / 2)][Math.floor(col / 2)];
      else tile.setAttribute("aria-hidden", "true");
      fragment.append(tile);
    }
  }
  board.replaceChildren(fragment);
}

function newPuzzle() {
  const size = Number(sizeInput.value);
  let next;
  do {
    next = generatePuzzle(size).clues;
  } while (JSON.stringify(next) === JSON.stringify(clues));
  clues = next;
  draw();
}

document.querySelector("#new").addEventListener("click", newPuzzle);
document.querySelector("#reset").addEventListener("click", draw);
sizeInput.addEventListener("change", newPuzzle);
document.querySelector("#check").addEventListener("click", () => {
  if (!matchesClues(clues, lines)) {
    result.textContent = "숫자와 둘러싼 선의 개수가 다른 칸이 있어요.";
  } else if (!isSingleLoop(lines)) {
    result.textContent = "모든 선을 이어 갈라지지 않는 하나의 고리를 만들어 보세요.";
  } else {
    result.textContent = "정답이에요! 하나의 고리를 완성했습니다.";
  }
});
newPuzzle();
