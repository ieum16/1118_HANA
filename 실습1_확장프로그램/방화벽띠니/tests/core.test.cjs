const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'));
const C = globalThis.TodoCore;
const countedDay = C.emptyDay();
for (let i = 0; i < 4; i++) assert.equal(C.addTask(countedDay, { id: String(i), minutes: 10 }), i + 1);
countedDay.tasks[0].done = true;
countedDay.tasks.splice(0, 1);
assert.equal(C.addTask(countedDay, { id: 'fifth', minutes: 10 }), 5, 'Completion and deletion must not lower cumulative additions');
assert.equal(C.addTask(countedDay, { id: 'sixth', minutes: 10 }), 6);
assert.equal(C.emptyDay().addedCount, 0, 'A new day resets additions');
assert.equal(C.addTask({ tasks: [{ id: 'legacy' }] }, { id: 'new' }), 2, 'Migrate existing records');
const task = (id, minutes, done = false) => ({ id, text: `일 ${id}`, minutes, done });
for (const count of [0,1,4,5,6,9,10,11,15]) {
  const pending = {tasks:Array.from({length:count},(_,i)=>task(String(i),10)).concat(Array.from({length:5},(_,i)=>task(`done-${i}`,10,true))),addedCount:500};
  assert.equal(C.shouldShowHuh(pending),count>0&&count%5===0, `HUH must use unfinished tasks only: ${count}`);
}
assert.equal(C.dayKey(new Date(2026, 0, 2)), '2026-01-02');
assert.equal(C.roundTime(new Date(2026, 10, 19, 9, 2)), '09:05');
assert.equal(C.roundTime(new Date(2026, 10, 19, 9, 5)), '09:05');
assert.equal(C.roundTime(new Date(2026, 10, 19, 23, 59, 50)), '23:59');
const day = { start: '09:00', tasks: [task('a', 30), task('b', 60, true), task('c', 15)] };
let result = C.schedule(day, '2026-11-19');
assert.deepEqual(result.map(t => t.id), ['a', 'c']);
assert.equal(new Date(result[0].start).getHours(), 9);
assert.equal(result[1].start, result[0].end);
assert.equal((result.at(-1).end - result[0].start) / 60000, 45);
assert.equal(day.tasks[0].start, undefined, 'Scheduling must not mutate stored tasks');
day.tasks.reverse();
assert.equal(C.schedule(day, '2026-11-19')[0].id, 'c');
result = C.schedule({ start: '23:45', tasks: [task('a', 30), task('b', 60)] }, '2026-12-31');
assert.equal(C.dayKey(new Date(result[0].end)), '2027-01-01');
assert.equal(new Date(result[1].start).getMinutes(), 15);
assert.deepEqual(C.schedule({ start: '09:00', tasks: [task('done', 10, true)] }, '2026-11-19'), []);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
for (const file of [manifest.action.default_popup, manifest.background.service_worker, ...Object.values(manifest.icons)]) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing manifest asset: ${file}`);
}
for (const file of ['img/cat-gag.png','media/gag-cat.mp3','media/huh-cat.mp4','media/huh-cat.mp3']) assert.ok(fs.existsSync(path.join(root,file)), `Missing reaction asset: ${file}`);
for (const file of ['todo.js', 'core.js', 'background.js', 'cat-animation.js', 'cat-sound.js', 'fx-core.js', 'fx.js']) new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'));
console.log('PASS: scheduling, completion exclusion, ordering, midnight/year rollover, manifest assets, JavaScript syntax');
