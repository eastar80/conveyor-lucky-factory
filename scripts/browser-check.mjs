import { writeFile } from 'node:fs/promises';

const [url, output = 'browser-check.png', widthArg = '1280', heightArg = '820', waitArg = '1200'] = process.argv.slice(2);
if (!url) throw new Error('URL is required');

const target = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
function send(method, params = {}) {
  const messageId = ++id;
  ws.send(JSON.stringify({ id: messageId, method, params }));
  return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
}
await send('Page.enable');
await send('Runtime.enable');
const width = Number(widthArg), height = Number(heightArg);
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
await send('Page.navigate', { url });
await new Promise(resolve => setTimeout(resolve, Number(waitArg)));
const status = await send('Runtime.evaluate', {
  expression: `JSON.stringify({error:document.body.dataset.jsError||null,stage:document.body.dataset.testStage||null,complete:document.body.dataset.testComplete||null,title:document.querySelector('#stageTitle')?.textContent,winners:document.querySelectorAll('#winnerList span').length,collisionCount:Number(document.body.dataset.collisions||0),winnerCount:Number(document.body.dataset.winners||0),setupHidden:document.querySelector('#setup')?.hidden,setupDisplay:getComputedStyle(document.querySelector('#setup')).display,factoryHidden:document.querySelector('#factory')?.hidden,factoryTop:document.querySelector('#factory')?.getBoundingClientRect().top,scrollY})`,
  returnByValue: true
});
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(output, Buffer.from(shot.data, 'base64'));
process.stdout.write(status.result.value + '\n');
ws.close();
