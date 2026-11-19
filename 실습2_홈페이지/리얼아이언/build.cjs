"use strict";
const fs = require("node:fs");
const path = require("node:path");

const output = path.join(__dirname, "dist");
const staticFiles = ["index.html", "budget.html", "budget.js", "budget-core.js", "images/logo.png"];

for (const file of staticFiles) {
  const source = path.join(__dirname, file);
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
}

console.log("Vercel 정적 배포 파일을 dist 폴더에 준비했습니다.");
console.log("공동 예산 저장에는 별도의 공유 API·데이터베이스 연결이 필요합니다.");
