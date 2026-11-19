// Headless UI smoke test; Chrome extension APIs are mocked for file-page testing.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'today-cat-qa-'));
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const watchdog = setTimeout(() => { console.error('Browser test timed out'); browser.kill(); process.exit(1); }, 45000);
async function main() {
  let serial = 0, sessionId, buffer = ''; const pending = new Map(), errors = [];
  function receive(data) {
    const message = JSON.parse(data);
    if (message.id) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(message.error) : p.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  }
  browser.stdio[4].on('data', chunk => {
    buffer += chunk.toString();
    let boundary;
    while ((boundary = buffer.indexOf('\0')) >= 0) { receive(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject }); browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__saved = {}; window.__listeners = [];
    window.chrome = {
      storage: { local: { get: async () => JSON.parse(localStorage.getItem('qa-data') || '{}'), set: async data => {
        const previous = JSON.parse(localStorage.getItem('qa-data') || '{}');
        localStorage.setItem('qa-data', JSON.stringify({...previous,...data})); window.__saved = {...previous,...data};
        for (const listener of __listeners) listener(Object.fromEntries(Object.entries(data).map(([k,v]) => [k,{oldValue:previous[k],newValue:v}])), 'local');
      } }, onChanged: { addListener: listener => __listeners.push(listener) } },
      tabs: { create: async () => {} }, runtime: { getURL: value => value }
    };` });
  const url = pathToFileURL(path.resolve(__dirname, '../todo.html')).href;
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) {
    if (await evaluate('document.readyState === "complete" && typeof ready !== "undefined" && ready')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(await evaluate('ready'), true);
  assert.equal(await evaluate('document.body.scrollWidth'), 360);
  assert.equal(await evaluate(`document.getElementById('cat').getAttribute('src')`), 'img/cat-neutral.png');
  assert.equal(await evaluate(`document.getElementById('happyVideo').hidden`), true);
  assert.equal(await evaluate(`document.getElementById('happySound').paused && document.getElementById('cryingSound').paused`), true, 'Opening must be silent');
  await evaluate(`document.getElementById('startTime').value='10:00'; document.getElementById('startTime').dispatchEvent(new Event('change'));`);
  await evaluate('Math.random = () => 0.1');
  await evaluate(`document.getElementById('taskInput').value='제안서 작성'; document.getElementById('form').requestSubmit(); saveQueue;`);
  assert.equal(await evaluate(`document.querySelectorAll('#list .task').length`), 1);
  assert.equal(await evaluate(`document.getElementById('cat').getAttribute('src')`), 'img/cat-crying.png');
  for (let i=0;i<30;i++) {
    if (await evaluate(`document.getElementById('cryingSound').currentTime>0`)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await evaluate(`!document.getElementById('cryingSound').paused && !document.getElementById('cryingSound').muted && document.getElementById('cryingSound').currentTime>0 && document.getElementById('cryingSound').volume===0.45`), true, 'Adding must play the bundled crying sound');
  assert.ok((await evaluate(`document.querySelector('.task-time').textContent`)).includes('10:00'));
  await evaluate('Math.random = () => 0.5');
  await evaluate(`document.getElementById('taskInput').value='<img src=x onerror=alert(1)> 메일 보내기'; document.getElementById('duration').value='15'; document.getElementById('form').requestSubmit(); saveQueue;`);
  assert.equal(await evaluate(`document.getElementById('cat').getAttribute('src')`), 'img/cat-crying-surprised.png');
  assert.equal(await evaluate(`document.querySelectorAll('#list img').length`), 0, 'Task text must not become HTML');
  await evaluate(`document.querySelectorAll('.order-controls button')[1].click(); saveQueue;`);
  assert.ok((await evaluate(`document.querySelector('.task-title').textContent`)).includes('메일 보내기'));
  await evaluate(`document.querySelector('.complete-button').click(); saveQueue;`);
  assert.equal(await evaluate(`document.querySelectorAll('#list .task').length`), 1);
  assert.equal(await evaluate(`document.querySelectorAll('#doneList .done-task').length`), 1);
  assert.equal(await evaluate(`document.getElementById('happyCat').hidden`), false);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(await evaluate(`document.getElementById('happyVideo').currentTime > 0 && !document.getElementById('happyVideo').paused`), true, 'Happy cat must actually play');
  assert.equal(await evaluate(`!document.getElementById('happySound').paused && !document.getElementById('happySound').muted && document.getElementById('happySound').currentTime>0 && document.getElementById('cryingSound').paused`), true, 'Completion must replace crying with happy sound');
  assert.equal(await evaluate(`document.getElementById('happyVideo').hidden && !document.getElementById('happyVideo').controls && document.getElementById('happyVideo').muted`), true, 'Decoder must remain invisible and silent');
  assert.ok(await evaluate(`Number(document.getElementById('happyCat').dataset.frames) > 2`), 'Animation must draw multiple frames');
  const pixels = await evaluate(`(() => {
    const c=document.getElementById('happyCat'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let transparent=0,opaque=0,green=0,minY=c.height,maxY=0;
    for(let i=0;i<d.length;i+=4){if(d[i+3]<10)transparent++;if(d[i+3]>128){opaque++;const y=Math.floor(i/4/c.width);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(d[i+1]>d[i]+40&&d[i+1]>d[i+2]+40)green++;}}
    return {transparent:transparent/(c.width*c.height),opaque,green,height:(maxY-minY)/2};
  })()`);
  assert.ok(pixels.transparent > 0.5, 'Most of the canvas should be transparent');
  assert.ok(pixels.opaque > 5000 && pixels.height > 130, 'Cat should be visibly larger than the previous video');
  assert.equal(pixels.green, 0, 'Green-screen pixels should be removed');
  await evaluate(`document.querySelector('#doneList button').click(); saveQueue;`);
  assert.equal(await evaluate(`document.querySelectorAll('#list .task').length`), 2);
  assert.equal(await evaluate(`document.getElementById('happyVideo').paused && document.getElementById('happyCat').hidden`), true);
  assert.equal(await evaluate(`document.getElementById('happySound').paused && document.getElementById('cryingSound').paused`), true, 'Undo must stop reaction sounds');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await evaluate(`document.querySelectorAll('#list .task').length`), 2, 'Tasks must survive reopening');
  assert.equal(await evaluate(`document.getElementById('cat').getAttribute('src')`), 'img/cat-neutral.png', 'Reopening must show normal cat');
  await evaluate(`day().tasks.find(t => t.text.includes('<img')).text = '메일 보내기'; save(); render(); saveQueue;`);
  await evaluate(`document.querySelector('.complete-button').click(); saveQueue;`);
  await new Promise(r => setTimeout(r, 1700));
  assert.equal(await evaluate(`document.getElementById('cat').complete && document.getElementById('cat').naturalWidth > 0`), true, 'Cat photo must load');
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.resolve(__dirname, '../../todo-extension-preview.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate(`document.getElementById('happyVideo').dispatchEvent(new Event('ended'))`);
  assert.equal(await evaluate(`document.getElementById('cat').getAttribute('src')`), 'img/cat-neutral.png');
  assert.equal(await evaluate(`document.getElementById('happyVideo').paused && document.getElementById('happyCat').hidden`), true);
  const normalScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.resolve(__dirname, '../../todo-extension-default-preview.png'), Buffer.from(normalScreenshot.data, 'base64'));
  // Match Chrome's shorter popup and finish a task far below the character.
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 600, deviceScaleFactor: 1, mobile: false });
  await evaluate(`for (let i=0;i<10;i++) day().tasks.push({id:crypto.randomUUID(),text:'아래쪽 할 일 '+i,minutes:10,done:false}); render(); save(); saveQueue;`);
  await evaluate(`document.querySelector('#list .task:last-child .complete-button').scrollIntoView({behavior:'instant',block:'center'})`);
  assert.ok(await evaluate(`document.querySelector('.cat-stage').getBoundingClientRect().bottom < 0`), 'Regression setup must put the character offscreen');
  await evaluate(`document.querySelector('#list .task:last-child .complete-button').click(); saveQueue;`);
  for (let i=0;i<20;i++) {
    if (await evaluate(`(() => { const r=document.querySelector('.cat-stage').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight; })()`)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await evaluate(`(() => { const r=document.querySelector('.cat-stage').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight; })()`), true, 'Completing a lower task must bring the entire cat card into view');
  assert.equal(await evaluate(`!document.getElementById('happyCat').hidden && Number(document.getElementById('happyCat').dataset.frames)>0`), true, 'Celebration must still be active after scrolling');
  await evaluate(`document.querySelector('#list .task:last-child .complete-button').scrollIntoView({behavior:'instant',block:'center'})`);
  await evaluate(`document.getElementById('taskInput').value='방금 추가한 일정'; document.getElementById('form').requestSubmit(); saveQueue;`);
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(await evaluate(`(() => {const r=document.querySelector('.cat-stage').getBoundingClientRect();return !document.getElementById('cat').hidden && r.top>=0 && r.bottom<=innerHeight;})()`),true,'Adding must first reveal the photo reaction');
  assert.equal(await evaluate(`document.querySelector('#list .task:last-child').getBoundingClientRect().top>=innerHeight`),true,'Schedule must not replace the photo immediately');
  for (let i=0;i<30;i++) {
    if (await evaluate(`(() => { const r=document.querySelector('#list .task:last-child').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight; })()`)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await evaluate(`(() => { const t=document.querySelector('#list .task:last-child'),r=t.getBoundingClientRect();return t.textContent.includes('방금 추가한 일정')&&r.top>=0&&r.bottom<=innerHeight; })()`), true, 'Adding to a long list must reveal the newly scheduled task');
  await evaluate(`document.getElementById('soundToggle').click(); saveQueue;`);
  assert.equal(await evaluate(`document.getElementById('happySound').paused && document.getElementById('cryingSound').paused && state.soundEnabled===false`), true, 'Mute must immediately stop all sounds');
  await evaluate(`document.querySelector('.complete-button').click(); saveQueue;`);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await evaluate(`document.getElementById('happySound').paused && !document.getElementById('happyCat').hidden`), true, 'Muted completion must keep animation without sound');
  await send('Page.reload');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate(`state.soundEnabled===false && document.getElementById('soundToggle').getAttribute('aria-pressed')==='false'`), true, 'Mute preference must survive reopening');
  await evaluate(`document.getElementById('soundToggle').click(); saveQueue; document.querySelector('.complete-button').click(); saveQueue;`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await evaluate(`!document.getElementById('happySound').paused`), true, 'Sound must work again after unmuting');
  // Check each new reaction on a clean day, including cumulative additions after deletion.
  await evaluate(`showNeutral(); state.days[today]=C.emptyDay(); render(); Math.random=()=>0.95; document.getElementById('taskInput').value='우웩 반응'; document.getElementById('form').requestSubmit(); saveQueue;`);
  assert.equal(await evaluate(`document.getElementById('cat').getAttribute('src')`), 'img/cat-gag.png');
  for (let i=0;i<20;i++) {
    if (await evaluate(`document.getElementById('gagSound').currentTime>0`)) break;
    await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.equal(await evaluate(`document.getElementById('gagSound').currentTime>0 && document.getElementById('cryingSound').paused`), true, 'Gag photo must play its own gag sound');
  await evaluate(`for(let i=0;i<3;i++){document.getElementById('taskInput').value='누적 테스트 '+i;document.getElementById('form').requestSubmit();} saveQueue;`);
  assert.equal(await evaluate(`day().addedCount`), 4);
  await evaluate(`document.querySelector('.complete-button').click();saveQueue;`);
  await evaluate(`document.querySelector('#doneList button:last-child').click();saveQueue;`);
  assert.equal(await evaluate(`day().addedCount`), 4, 'Deleting a completed record must preserve the counter');
  await evaluate(`document.getElementById('taskInput').value='다섯 번째';document.getElementById('form').requestSubmit();saveQueue;`);
  assert.equal(await evaluate(`day().tasks.filter(t=>!t.done).length===4 && !document.querySelector('.cat-stage').classList.contains('huh')`), true, 'Completed and deleted tasks must not count toward HUH');
  await evaluate(`document.getElementById('taskInput').value='여섯 번째 추가, 남은 다섯 개';document.getElementById('form').requestSubmit();saveQueue;`);
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(await evaluate(`day().tasks.filter(t=>!t.done).length===5 && document.querySelector('.cat-stage').classList.contains('huh') && document.getElementById('happyCat').dataset.variant==='huh'`), true, 'Five unfinished tasks must switch to Huh');
  assert.equal(await evaluate(`!document.getElementById('huhVideo').paused && Number(document.getElementById('happyCat').dataset.frames)>2`), true, 'Huh must animate using the requested cat video');
  assert.equal(await evaluate(`document.getElementById('huhSound').currentTime>0 && document.getElementById('gagSound').paused && document.getElementById('cryingSound').paused`), true, 'Huh reaction must use its matching sound without overlap');
  const huhPixels = await evaluate(`(() => {const c=document.getElementById('happyCat'),d=c.getContext('2d').getImageData(0,0,600,600).data;let clear=0,solid=0,green=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<10)clear++;if(d[i+3]>128){solid++;if(d[i+1]>d[i]+40&&d[i+1]>d[i+2]+40)green++;}}return{clear,solid,green};})()`);
  assert.ok(huhPixels.clear>100000 && huhPixels.solid>10000, 'Huh must have a transparent background and a visible cat');
  assert.equal(huhPixels.green, 0);
  const huhScreenshot = await send('Page.captureScreenshot', { format:'png',captureBeyondViewport:true });
  fs.writeFileSync(path.resolve(__dirname, '../../todo-extension-huh-preview.png'), Buffer.from(huhScreenshot.data,'base64'));
  await new Promise(resolve => setTimeout(resolve, 2400));
  assert.equal(await evaluate(`(() => {const r=document.querySelector('.schedule-section').getBoundingClientRect();return r.top>=0&&r.top<innerHeight;})()`), true, 'Schedule should appear automatically after the Huh reaction');
  await send('Page.reload'); await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal(await evaluate(`day().tasks.filter(t=>!t.done).length`), 5, 'Unfinished tasks must survive reopening');
  await evaluate(`document.getElementById('taskInput').value='남은 여섯 개';document.getElementById('form').requestSubmit();saveQueue;`);
  assert.equal(await evaluate(`day().tasks.filter(t=>!t.done).length===6 && !document.querySelector('.cat-stage').classList.contains('huh')`), true, 'Six unfinished tasks must not show Huh');
  await evaluate(`document.getElementById('soundToggle').click();saveQueue;`);
  assert.equal(await evaluate(`['happySound','cryingSound','gagSound','huhSound'].every(id=>document.getElementById(id).paused)`), true, 'Mute must cover all four reaction sounds');
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate(`for(let i=0;i<3;i++){document.getElementById('taskInput').value='남은 개수 준비 '+i;document.getElementById('form').requestSubmit();}saveQueue;`);
  await evaluate(`document.getElementById('taskInput').value='동작 줄이기 확인';document.getElementById('form').requestSubmit();saveQueue;`);
  await new Promise(resolve=>setTimeout(resolve,500));
  const reduced = await evaluate(`({frames:document.getElementById('happyCat').dataset.frames,paused:document.getElementById('huhVideo').paused,time:document.getElementById('huhVideo').currentTime,reduce:matchMedia('(prefers-reduced-motion: reduce)').matches})`);
  assert.ok(reduced.frames==='1' && reduced.paused, `Reduced motion must show one decoded frame: ${JSON.stringify(reduced)}`);
  assert.equal(await evaluate(`day().tasks.filter(t=>!t.done).length===10 && document.querySelector('.cat-stage').classList.contains('huh')`), true, 'Ten unfinished tasks must also trigger Huh');
  await evaluate(`showNeutral();window.fxInput=(id,value)=>{const element=document.getElementById(id);element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));};`);
  const todoBeforeFx = await evaluate(`JSON.stringify(state.days)`);
  await evaluate(`fxInput('fxAmount','100');fxInput('fxBase','1400');fxInput('fxBuySpread','1.75');fxInput('fxSellSpread','1.75');fxInput('fxPreference','90');`);
  assert.equal(await evaluate(`document.getElementById('fxBuyResult').textContent`),'140,245원');
  assert.equal(await evaluate(`document.getElementById('fxSellResult').textContent`),'139,755원');
  await evaluate(`document.querySelector('[data-fx-currency="JPY"]').click();fxInput('fxAmount','10000');fxInput('fxBase','950');fxInput('fxBuySpread','1.75');fxInput('fxSellSpread','1.75');fxInput('fxPreference','90');`);
  assert.equal(await evaluate(`document.getElementById('fxUnit').value`),'100');
  assert.equal(await evaluate(`document.getElementById('fxBaseResult').textContent`),'95,000원');
  await evaluate(`document.querySelector('[data-fx-currency="EUR"]').click();fxInput('fxAmount','50');fxInput('fxBase','1500');fxInput('fxBuySpread','2');fxInput('fxSellSpread','2');`);
  assert.equal(await evaluate(`document.getElementById('fxBuyResult').textContent`),'76,500원');
  const bankTable='통화\t매매기준율\t현찰 살 때\t현찰 팔 때\nUSD\t1500\t1526.25\t1473.75\nJPY (100엔)\t1000\t1017.5\t982.5\nEUR\t1600\t1632\t1568';
  await evaluate(`fxInput('fxPaste',${JSON.stringify(bankTable)});document.getElementById('fxReadTable').click();`);
  assert.equal(await evaluate(`document.querySelectorAll('#fxPreviewRows tr').length`),3,'Pasted bank table must find all three currencies');
  await evaluate(`document.getElementById('fxApplyTable').click()`);
  assert.equal(await evaluate(`document.getElementById('fxBase').value`),'1600');
  assert.equal(await evaluate(`document.getElementById('fxBuyResult').textContent`),'81,600원');
  await evaluate(`const transfer=new DataTransfer();transfer.setData('text/html','<table><tr><th rowspan="2">통화</th><th colspan="2">현찰</th><th rowspan="2">매매기준율</th></tr><tr><th>사실 때</th><th>파실 때</th></tr><tr><td>USD</td><td>1424.5</td><td>1375.5</td><td>1400</td></tr><tr><td>JPY (100엔)</td><td>966.625</td><td>933.375</td><td>950</td></tr></table>');document.getElementById('fxPaste').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));document.getElementById('fxReadTable').click();`);
  assert.equal(await evaluate(`document.querySelectorAll('#fxPreviewRows tr').length`),2,'Rich bank table must preserve rowspan/colspan headers');
  await evaluate(`document.getElementById('fxApplyTable').click();document.querySelector('[data-fx-currency="JPY"]').click();`);
  assert.equal(await evaluate(`document.getElementById('fxBase').value`),'950');
  assert.equal(await evaluate(`document.getElementById('fxAmount').value`),'10000','Import must preserve foreign amount');
  assert.equal(await evaluate(`document.getElementById('fxPreference').value`),'90','Import must preserve preference when absent');
  assert.equal(await evaluate(`JSON.stringify(state.days)`),todoBeforeFx,'FX storage must not modify todo state');
  // Wait for the independent FX write queue to settle before reopening.
  for(let i=0;i<30;i++){
    if(await evaluate(`JSON.parse(localStorage.getItem('qa-data')||'{}')[FxCore.KEY]?.selected==='JPY'`))break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  await send('Page.reload');await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal(await evaluate(`document.getElementById('fxAmount').value`),'10000');
  assert.equal(await evaluate(`document.getElementById('fxBase').value`),'950');
  assert.equal(await evaluate(`document.getElementById('fxPreference').value`),'90');
  assert.equal(await evaluate(`document.getElementById('fxPaste').value.includes('USD')`),true,'Pasted input must be saved');
  assert.equal(await evaluate(`JSON.stringify(state.days)`),todoBeforeFx,'Todo records must survive FX reopening');
  assert.equal(await evaluate(`document.body.scrollWidth`),360,'Calculator must fit the popup width');
  const fxBox=await evaluate(`(()=>{const r=document.getElementById('fxCalculator').getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()`);
  const fxScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:fxBox});
  fs.writeFileSync(path.resolve(__dirname,'../../todo-extension-fx-preview.png'),Buffer.from(fxScreenshot.data,'base64'));
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await evaluate(`document.getElementById('happySound').paused && document.getElementById('cryingSound').paused`), true, 'Closing must stop all audio');
  assert.deepEqual(errors, []);
  console.log('PASS: existing cat/sound/todo behavior, HUH only at 5/10 unfinished tasks, USD/JPY/EUR calculations, bank TSV and HTML span imports, independent saved FX and todo values, 360px layout');
  sessionId = undefined; await send('Browser.close');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); browser.kill(); });
