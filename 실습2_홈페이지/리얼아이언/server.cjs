"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {randomUUID} = require("node:crypto");
const {DatabaseSync} = require("node:sqlite");
const Core = require("./budget-core.js");
const port = Number(process.env.PORT || 4174);
const dataDirectory = process.env.AKI_DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(dataDirectory, {recursive: true});
const db = new DatabaseSync(path.join(dataDirectory, "budgets.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, content TEXT NOT NULL)");
const clients = new Set();
const list = () => db.prepare("SELECT content FROM projects ORDER BY rowid DESC").all().map(row => Core.normalize(JSON.parse(row.content)));
function get(id) {
  const row = db.prepare("SELECT content FROM projects WHERE id=?").get(id);
  return row ? Core.normalize(JSON.parse(row.content)) : null;
}
function respond(response, status, value) {
  response.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
  response.end(JSON.stringify(value));
}
function announce() {
  for (const client of clients) client.write("data: changed\n\n");
}
async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2000000) throw new Error("요청 데이터가 너무 큽니다.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function save(project) {
  project.updatedAt = new Date().toISOString();
  db.prepare("INSERT INTO projects(id,content) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content").run(project.id, JSON.stringify(project));
}
const files = {"/":["index.html","text/html"], "/index.html":["index.html","text/html"],
  "/budget.html":["budget.html","text/html"], "/budget.js":["budget.js","text/javascript"],
  "/budget-core.js":["budget-core.js","text/javascript"], "/images/logo.png":["images/logo.png","image/png"]};
const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  let transaction = false;
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (request.method !== "GET" && request.headers.origin && request.headers.origin !== "http://" + request.headers.host) {
      return respond(response, 403, {error:"같은 홈페이지에서 요청해 주세요."});
    }
    if (pathname === "/api/events" && request.method === "GET") {
      response.writeHead(200, {"Content-Type":"text/event-stream", "Cache-Control":"no-cache", "Connection":"keep-alive"});
      response.write("data: connected\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (pathname === "/api/projects" && request.method === "GET") return respond(response, 200, {projects:list()});
    if (pathname.startsWith("/api/")) {
      const body = await readBody(request);
      if (pathname === "/api/projects" && request.method === "POST") {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) throw new Error("사업명을 120자 이내로 입력해 주세요.");
        if (list().length >= 200) throw new Error("사업은 최대 200개까지 등록할 수 있습니다.");
        const project = Core.validate(Core.create(randomUUID(), body.name.trim()));
        save(project);
        announce();
        return respond(response, 201, {project});
      }
      if (!/^\/api\/projects\/[a-zA-Z0-9-]+$/.test(pathname)) return respond(response,404,{error:"요청 주소를 확인해 주세요."});
      db.exec("BEGIN IMMEDIATE");
      transaction = true;
      const id = pathname.split("/")[3];
      const current = get(id);
      if (!current) {
        db.exec("ROLLBACK");
        transaction = false;
        return respond(response, 404, {error:"사업을 찾을 수 없습니다. 최신 목록을 확인해 주세요."});
      }
      if (request.method === "PUT") {
        const project = Core.merge(current, body.base, body.draft);
        if (typeof body.editor !== "string" || !body.editor.trim() || body.editor.length > 80) throw new Error("작성자 이름을 80자 이내로 입력해 주세요.");
        project.updatedBy = body.editor.trim();
        project.revision = current.revision + 1;
        save(project);
        db.exec("COMMIT");
        transaction = false;
        announce();
        return respond(response, 200, {project});
      }
      if (request.method === "DELETE") {
        if (body.revision !== current.revision) {
          const error = new Error("다른 사용자가 수정했습니다. 최신 내용을 확인한 뒤 삭제해 주세요.");
          error.conflicts = ["사업 삭제"];
          throw error;
        }
        db.prepare("DELETE FROM projects WHERE id=?").run(id);
        db.exec("COMMIT");
        transaction = false;
        announce();
        return respond(response, 200, {deleted:id});
      }
      db.exec("ROLLBACK");
      transaction = false;
      return respond(response, 405, {error:"지원하지 않는 요청입니다."});
    }
    const asset = files[pathname];
    if (!asset || request.method !== "GET") {
      response.writeHead(404);
      return response.end("Not found");
    }
    response.writeHead(200, {"Content-Type":asset[1] + (asset[1].startsWith("text") ? "; charset=utf-8" : ""), "Cache-Control":"no-cache"});
    fs.createReadStream(path.join(__dirname, asset[0])).pipe(response);
  } catch (error) {
    if (transaction) db.exec("ROLLBACK");
    respond(response, error.conflicts ? 409 : 400, {error:error.message, conflicts:error.conflicts});
  }
});
const heartbeat = setInterval(() => {
  for (const client of clients) client.write(": heartbeat\n\n");
}, 20000);
server.listen(port, "0.0.0.0", () => {
  console.log("아키기획팀 공유 홈페이지 http://localhost:" + port);
  try {
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries) if (entry.family === "IPv4" && !entry.internal) console.log("팀 공유 주소 http://" + entry.address + ":" + port);
    }
  } catch {}
});
server.on("error", error => {
  console.error(error.code === "EADDRINUSE" ? "이미 사용 중인 포트입니다. 실행된 서버를 확인해 주세요." : error.message);
  clearInterval(heartbeat);
  db.close();
  process.exitCode = 1;
});
function shutdown() {
  clearInterval(heartbeat);
  for (const client of clients) client.end();
  server.close(() => {db.close(); process.exit(0);});
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
