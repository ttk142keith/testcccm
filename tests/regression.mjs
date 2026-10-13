/* Kiểm thử hồi quy cho các lỗi đã sửa sau đợt review 10/2026 (mỗi nhóm = 1 lỗi, ghi số lỗi theo báo cáo review).
   Mỗi nhóm chạy trong một trình duyệt sạch riêng nên lỗi ở nhóm này không kéo theo nhóm khác.
   Chạy: node tests/regression.mjs [đường-dẫn-index.html]   (mặc định: index.html ở thư mục gốc) */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const file = resolve(process.argv[2] || 'index.html');
const html = readFileSync(file);
const dir = mkdtempSync(join(tmpdir(), 'cccm-rg-'));   // nơi đặt các file JSON dùng để thử chức năng nhập file
const server = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch();
let passed = 0, failed = 0;
const check = (c, m) => { console.log(`     ${c ? '✅' : '❌'} ${m}`); c ? passed++ : failed++; };
const settle = p => p.waitForTimeout(300);
const jsonFile = (name, data) => { const f = join(dir, name); writeFileSync(f, JSON.stringify(data)); return f; };

/* Mở app ở trình duyệt sạch, vào thẳng bằng tài khoản `user` (cổng cũ chỉ kiểm tra tên trong sessionStorage).
   `init` (tuỳ chọn) chạy trước mọi script của trang. Hộp confirm/alert được tự động bấm OK. */
async function open(user, init) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.route('**/script.google.com/**', r => r.abort());
  if (init) await ctx.addInitScript(init);
  if (user) await ctx.addInitScript(u => { try { sessionStorage.setItem('cccm_auth', JSON.stringify({ u })); } catch {} }, user);
  const p = await ctx.newPage(); p.setDefaultTimeout(5000);
  const errors = [];
  opened.push({ ctx, errors });
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForTimeout(400);
  return { ctx, p, errors };
}
const read = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);

let opened = [];   // các trình duyệt mở trong nhóm đang chạy: luôn được kiểm tra lỗi JS rồi đóng, kể cả khi nhóm dừng giữa chừng
async function group(title, fn) {
  console.log(`   ${title}`);
  opened = [];
  try { await fn(); }
  catch (e) { check(false, 'dừng giữa chừng: ' + e.message.split('\n')[0]); }
  for (const { ctx, errors } of opened) {
    if (errors.length) check(false, 'lỗi JavaScript: ' + [...new Set(errors)].join(' | '));
    await ctx.close();
  }
}

/* Mã độc thử: nếu chạy được thì đặt window.__pwn */
const EVIL_QID = '<img src=x onerror="window.__pwn=\'qid\'">';
const EVIL_ID = 'z" autofocus onfocus="window.__pwn=\'id\'" x="';
const fbItem = (o) => Object.assign({ id: 'fbok1', ts: 1000, sid: 'coban', sname: 'Cơ bản', qid: 1, qstem: 'Đề', cur: 'd', sug: 'b', body: 'nội dung', user: 'tuan.nt', name: '', sent: true, done: false }, o);

await group('#1. Admin nhập file góp ý: dữ liệu trong file không được chạy thành mã', async () => {
  const s = await open('kiet.tt'); const { p } = s;
  await p.locator('#dataBox summary').click();
  await p.locator('#fbImportFile').setInputFiles(jsonFile('gopy.json', { app: 'OnTapCCCM-GopY', version: 1, items: [
    fbItem({ id: 'fbbad1', qid: EVIL_QID }), fbItem({ id: EVIL_ID, qid: 2 }), fbItem({}),
  ] }));
  await settle(p);
  for (const b of await p.locator('#fbList button').all()) await b.focus();
  check(await p.evaluate(() => window.__pwn) === undefined, `nhập file chứa mã độc ở "qid" và "id" → không chạy (window.__pwn = ${await p.evaluate(() => String(window.__pwn))})`);
  const ids = (await read(p, 'cccm_feedback') || []).map(i => i.id);
  check(JSON.stringify(ids) === '["fbok1"]', `chỉ nhận góp ý đúng định dạng → ${JSON.stringify(ids)}`);

  /* các nút của góp ý hợp lệ vẫn chạy */
  await p.locator('#fbList button', { hasText: 'Áp thành đáp án' }).click(); await settle(p);
  check((await read(p, 'cccm_coban_overrides') || {})[1]?.a === 'b', 'nút "Áp thành đáp án" vẫn hoạt động');
  check((await read(p, 'cccm_feedback'))[0].done === true, 'góp ý được đánh dấu đã xử lý sau khi áp');
  await p.locator('#fbList button', { hasText: 'Bỏ đánh dấu' }).click(); await settle(p);
  check((await read(p, 'cccm_feedback'))[0].done === false, 'nút "Bỏ đánh dấu" vẫn hoạt động');
  await p.locator('#fbList button', { hasText: 'Xoá' }).click(); await settle(p);
  check((await read(p, 'cccm_feedback') || []).length === 0, 'nút "Xoá" vẫn hoạt động');
  return s;
});

await group('#1. Góp ý độc đã nằm sẵn trên máy (nhập từ bản cũ) vẫn hiển thị an toàn', async () => {
  const s = await open('kiet.tt'); const { p } = s;
  await p.evaluate(([a, b]) => localStorage.setItem('cccm_feedback', JSON.stringify([a, b])), [fbItem({ id: 'fbx1', qid: EVIL_QID }), fbItem({ id: EVIL_ID })]);
  await p.reload(); await p.waitForTimeout(400);
  await p.locator('#dataBox summary').click(); await settle(p);
  for (const b of await p.locator('#fbList button').all()) await b.focus();
  check(await p.evaluate(() => window.__pwn) === undefined, `hiển thị danh sách góp ý → không chạy mã (window.__pwn = ${await p.evaluate(() => String(window.__pwn))})`);
  check((await p.locator('#fbList').innerText()).includes('Câu #<img'), 'nội dung lạ được hiện dưới dạng chữ');
  return s;
});

await group('#1. Nhập file TIẾN ĐỘ có kèm góp ý: cũng lọc góp ý sai định dạng', async () => {
  const s = await open('kiet.tt'); const { p } = s;
  await p.locator('#dataBox summary').click();
  await p.locator('#importFile').setInputFiles(jsonFile('tiendo.json', { app: 'OnTapCCCM', version: 2,
    progress: { coban: { history: [], stats: {}, overrides: {}, bookmarks: [] } },
    feedback: [fbItem({ id: 'fbbad2', qid: EVIL_QID }), fbItem({ id: 'fbok2' })] }));
  await settle(p);
  const ids = (await read(p, 'cccm_feedback') || []).map(i => i.id);
  check(JSON.stringify(ids) === '["fbok2"]', `chỉ nhận góp ý đúng định dạng → ${JSON.stringify(ids)}`);
  check(await p.evaluate(() => window.__pwn) === undefined, 'không chạy mã');
  return s;
});

/* Vào kỳ thi `prog` → môn `subj` → tab `tab` */
async function openTab(p, prog, subj, tab) {
  if (await p.locator('#homeCrumb .backbtn').isVisible()) { await p.locator('#homeCrumb .backbtn').click(); await settle(p); }
  await p.locator('.progcard', { hasText: prog }).click(); await settle(p);
  await p.locator('#subGrid .subj', { hasText: subj }).click(); await settle(p);
  await p.locator(`#tabs button[data-tab="${tab}"]`).click(); await settle(p);
}

await group('#4. Luyện đề: mỗi lượt làm 1 câu chỉ được tính thống kê 1 lần', async () => {
  const s = await open('tuan.nt'); const { p } = s;
  await openTab(p, 'CCCM', 'Cơ bản', 'luyen');
  const stat = async id => JSON.stringify(((await read(p, 'cccm_coban_stats')) || {})[id] || null);
  const ids = await p.locator('#qList .q').evaluateAll(els => els.slice(0, 2).map(e => +e.dataset.id));
  const [id1, id2] = ids;
  const ans1 = await p.evaluate(id => ansOf(DB.find(q => q.id === id)), id1);
  const wrong1 = await p.evaluate(([id, a]) => DB.find(q => q.id === id).options.map(o => o.key).filter(k => k !== a), [id1, ans1]);
  /* force: phương án đã khoá có aria-disabled, Playwright mặc định không bấm; người dùng thật vẫn bấm được */
  const opt = (id, k) => ({ click: () => p.locator(`#qList .q[data-id="${id}"] .opt[data-k="${k}"]`).click({ force: true }) });

  await opt(id1, wrong1[0]).click(); await opt(id1, ans1).click(); await opt(id1, wrong1[1]).click(); await settle(p);
  check(await stat(id1) === '{"seen":1,"correct":0,"wrong":1}', `chọn sai, rồi bấm tiếp đáp án đúng và 1 phương án khác → chỉ tính lần đầu: ${await stat(id1)}`);
  check(await p.evaluate(id => sess().luyen.picked[id], id1) === wrong1[0], 'giữ lựa chọn đầu tiên');
  check(await p.locator(`#qList .q[data-id="${id1}"]`).evaluate(e => e.classList.contains('answered')), 'các phương án bị khoá sau khi chọn');

  await p.locator(`#qList .q[data-id="${id2}"] .qfoot .btn`).first().click();   // "Hiện đáp án"
  await opt(id2, 'a').click(); await settle(p);
  check(await stat(id2) === 'null', `bấm "Hiện đáp án" rồi mới chọn → không tính: ${await stat(id2)}`);

  await p.locator('#hideAll').click(); await settle(p);
  check(!(await p.locator(`#qList .q[data-id="${id1}"]`).evaluate(e => e.classList.contains('answered'))), '"Ẩn đáp án" mở khoá các phương án');
  await opt(id1, wrong1[0]).click(); await settle(p);
  check(await stat(id1) === '{"seen":2,"correct":0,"wrong":2}', `sau "Ẩn đáp án", làm lại → tính thêm 1 lượt: ${await stat(id1)}`);

  await p.reload(); await p.waitForTimeout(500);
  await opt(id1, ans1).click(); await settle(p);
  check(await stat(id1) === '{"seen":2,"correct":0,"wrong":2}', `mở lại app, câu vẫn đang hiện đáp án → bấm không tính: ${await stat(id1)}`);

  await p.locator('#tabs button[data-tab="tiendo"]').click(); await settle(p);
  await p.locator('#weakRedoBtn').click(); await settle(p);
  await opt(id1, ans1).click(); await settle(p);
  check(await stat(id1) === '{"seen":3,"correct":1,"wrong":2}', `"Luyện lại các câu này" → làm lại được tính: ${await stat(id1)}`);
  return s;
});

await group('#13. Thi thử: số phút được kẹp trong 5–240 như số câu và ngưỡng đạt', async () => {
  const s = await open('tuan.nt'); const { p } = s;
  await openTab(p, 'CCCM', 'Cơ bản', 'thi');
  const start = async mins => {
    await p.evaluate(() => resetExamView());
    await p.locator('#exNum').fill('5'); await p.locator('#exMin').fill(String(mins));
    await p.locator('#startExam').click(); await p.waitForTimeout(1500);
    return p.evaluate(() => exam ? Math.round((exam.deadline - Date.now()) / 60000) : 'đã nộp');
  };
  const m1 = await start(-5);
  check(m1 === 5, `nhập -5 phút → bài thi 5 phút, không tự nộp ngay (còn: ${m1})`);
  check(((await read(p, 'cccm_coban_history')) || []).length === 0, 'không ghi lượt thi 0 điểm');
  const m2 = await start(999);
  check(m2 === 240, `nhập 999 phút → tối đa 240 (còn: ${m2})`);
  const m3 = await start(45);
  check(m3 === 45, `nhập 45 phút → giữ nguyên (còn: ${m3})`);
  return s;
});

/* Mô phỏng trình duyệt chặn lưu trữ: truy cập localStorage (và sessionStorage nếu `both`) ném SecurityError */
const blockLocal = () => {
  Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
};
const blockAll = () => {
  for (const k of ['localStorage', 'sessionStorage'])
    Object.defineProperty(window, k, { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
};
/* Mô phỏng bộ nhớ đầy: đọc được nhưng ghi thì lỗi */
const storageFull = () => {
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...a) {
    if (this === window.localStorage) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return set.apply(this, a);
  };
};

await group('#14. Trình duyệt chặn localStorage: app vẫn chạy và báo cho người dùng', async () => {
  const s = await open('tuan.nt', blockLocal); const { p } = s;
  check(await p.locator('.progcard').count() === 3, `vẫn hiện màn chọn kỳ thi (${await p.locator('.progcard').count()} kỳ thi)`);
  check(await p.locator('#storageWarn').isVisible(), 'hiện banner "trình duyệt đang chặn lưu dữ liệu"');
  await openTab(p, 'CCCM', 'Cơ bản', 'luyen');
  await p.locator('#qList .q').first().locator('.opt').first().click(); await settle(p);
  check(await p.locator('#qList .q').first().locator('.explain').count() === 1, 'vẫn làm bài được (chọn phương án → hiện đáp án)');
  return s;
});

await group('#14. Chặn cả sessionStorage, chưa đăng nhập: vẫn hiện form đăng nhập', async () => {
  const s = await open(null, blockAll); const { p } = s;
  check(await p.locator('#__loginGate').isVisible(), 'hiện form đăng nhập');
  return s;
});

await group('#14. Bộ nhớ trình duyệt đầy (ghi lỗi): app vẫn chạy và báo cho người dùng', async () => {
  const s = await open('tuan.nt', storageFull); const { p } = s;
  check(await p.locator('#storageWarn').isVisible(), 'hiện banner cảnh báo');
  await openTab(p, 'CCCM', 'Cơ bản', 'luyen');
  await p.locator('#qList .q').first().locator('.opt').first().click(); await settle(p);
  check(await p.locator('#qList .q').first().locator('.explain').count() === 1, 'vẫn làm bài được');
  return s;
});

await group('#14. Trình duyệt bình thường: không hiện banner cảnh báo', async () => {
  const s = await open('tuan.nt'); const { p } = s;
  check(await p.locator('#storageWarn').count() === 0, 'không có banner');
  return s;
});

await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? '❌' : '✅'} ${passed}/${passed + failed} kiểm tra đạt`);
process.exit(failed ? 1 : 0);
