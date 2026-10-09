/* Kiểm thử điều hướng: nút "← ...", nút Back/Tiến của trình duyệt, tự mở lại chương đang đọc dở, F5.
   Mỗi nhóm chạy trong một trình duyệt sạch riêng nên lỗi ở nhóm này không kéo theo nhóm khác.
   Chạy: node tests/navigation.mjs [đường-dẫn-index.html]   (mặc định: index.html ở thư mục gốc)
   Mỗi nhóm chạy 2 lần: mở qua web (http) và nháy đúp file (file://). */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'index.html');
const html = readFileSync(file);
const server = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch();
let passed = 0, failed = 0;
const check = (c, m) => { console.log(`     ${c ? '✅' : '❌'} ${m}`); c ? passed++ : failed++; };

const PROGRAMS = 'Chọn kỳ thi', SUBJECTS = 'Danh sách môn', CHAPTERS = 'Danh sách chương', OTHER_TAB = 'Trong môn (tab khác)';
const where = page => page.evaluate(([PG, SB, CH, OT]) => {
  const vis = s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
  if (vis('#subject')) {
    const d = document.querySelector('#chapList .chap-detail .num');
    if (vis('#hoc') && d) return 'Chương ' + d.textContent.replace(/\D/g, '');
    return vis('#hoc') ? CH : OT;
  }
  if (vis('#home')) return SB;
  if (vis('#programs')) return PG;
  return 'ĐÃ THOÁT KHỎI APP';
}, [PROGRAMS, SUBJECTS, CHAPTERS, OTHER_TAB]);

/* Thao tác như người dùng */
const settle = p => p.waitForTimeout(350);
const act = {
  program: (p, name) => p.locator('.progcard', { hasText: name }).click().then(() => settle(p)),
  subject: (p, name) => p.locator('#subGrid .subj', { hasText: name }).click().then(() => settle(p)),
  tab: (p, t) => p.locator(`#tabs button[data-tab="${t}"]`).click().then(() => settle(p)),
  chapter: (p, i) => p.locator('#chapList .chap').nth(i).click().then(() => settle(p)),
  backToChapters: p => p.locator('#chapList .backbtn').click().then(() => settle(p)),
  pickSubject: p => p.locator('#subject .backbtn').first().click().then(() => settle(p)),
  pickProgram: p => p.locator('#homeCrumb .backbtn').click().then(() => settle(p)),
  back: p => p.goBack().then(() => settle(p)),
  forward: p => p.goForward().then(() => settle(p)),
};

async function group(proto, title, fn) {
  const base = proto === 'http' ? `http://127.0.0.1:${server.address().port}/index.html` : 'file://' + file;
  console.log(`   ${title}`);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  /* Cổng đăng nhập cũ chỉ kiểm tra tên tài khoản trong sessionStorage → dùng để vào thẳng khi kiểm thử.
     try/catch: khi Back ra khỏi app (trang trắng) thì không có sessionStorage. */
  await ctx.addInitScript(() => { try { sessionStorage.setItem('cccm_auth', JSON.stringify({ u: 'tuan.nt' })); } catch {} });
  await ctx.route('**/script.google.com/**', r => r.abort());
  const errors = [];
  const open = async () => {      // mở app ở một tab mới (giống mở lại app hôm sau: lịch sử tab trống, dữ liệu học còn)
    const p = await ctx.newPage(); p.setDefaultTimeout(5000);
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base); await settle(p); return p;
  };
  /* Hôm qua: vào kỳ thi Quản lý Quỹ → môn Pháp luật → đọc dở chương `ch`, rồi đóng tab */
  const readYesterday = async ch => {
    const p = await open();
    if (await where(p) === PROGRAMS) await act.program(p, 'Quản lý Quỹ');
    await act.subject(p, 'Pháp luật');
    if ((await where(p)).startsWith('Chương')) await act.backToChapters(p);
    await act.chapter(p, ch - 1); await p.close();
  };
  try { await fn({ open, readYesterday }); }
  catch (e) { check(false, 'dừng giữa chừng: ' + e.message.split('\n')[0]); }
  if (errors.length) check(false, 'lỗi JavaScript: ' + [...new Set(errors)].join(' | '));
  await ctx.close();
}

async function suite(proto) {
  console.log(`\n══ ${proto === 'http' ? 'Mở qua web (http)' : 'Nháy đúp file (file://)'} ══`);

  await group(proto, '1. Lần đầu dùng app: đi xuống từng cấp, bấm Back/Tiến của trình duyệt', async ({ open }) => {
    const p = await open();
    check(await where(p) === PROGRAMS, `mở app → ${await where(p)}`);
    await act.program(p, 'Quản lý Quỹ'); await act.subject(p, 'Pháp luật'); await act.chapter(p, 1);
    check(await where(p) === 'Chương 2', `vào môn, mở chương 2 → ${await where(p)}`);
    await act.back(p); check(await where(p) === CHAPTERS, `Back → ${await where(p)}`);
    await act.back(p); check(await where(p) === SUBJECTS, `Back → ${await where(p)}`);
    await act.back(p); check(await where(p) === PROGRAMS, `Back → ${await where(p)}`);
    await act.forward(p); await act.forward(p); check(await where(p) === CHAPTERS, `Tiến ×2 → ${await where(p)}`);
  });

  await group(proto, '2. Các nút "← ..." khi đi đường bình thường', async ({ open }) => {
    const p = await open();
    await act.program(p, 'Quản lý Quỹ'); await act.subject(p, 'Pháp luật');
    await act.chapter(p, 1); await act.backToChapters(p);
    check(await where(p) === CHAPTERS, `chương 2 → "Quay lại danh sách chương" → ${await where(p)}`);
    await act.chapter(p, 2); await act.pickSubject(p);
    check(await where(p) === SUBJECTS, `đang đọc chương 3 → "Chọn môn khác" → ${await where(p)}`);
    await act.pickProgram(p); check(await where(p) === PROGRAMS, `"Chọn kỳ thi khác" → ${await where(p)}`);
  });

  await group(proto, '3. LỖI BẠN BÁO: hôm sau vào môn, app tự mở chương 3, bấm "Quay lại danh sách chương"', async ({ open, readYesterday }) => {
    await readYesterday(3);
    const p = await open();
    check(await where(p) === SUBJECTS, `mở app → ${await where(p)}`);
    await act.subject(p, 'Pháp luật'); check(await where(p) === 'Chương 3', `vào môn → tự mở lại ${await where(p)}`);
    await act.backToChapters(p); check(await where(p) === CHAPTERS, `"Quay lại danh sách chương" → ${await where(p)}`);
  });

  await group(proto, '4. Hôm sau, đang ở chương tự mở lại, bấm "Chọn môn khác"', async ({ open, readYesterday }) => {
    await readYesterday(3);
    const p = await open(); await act.subject(p, 'Pháp luật');
    await act.pickSubject(p); check(await where(p) === SUBJECTS, `"Chọn môn khác" → ${await where(p)}`);
  });

  await group(proto, '5. Hôm sau, đang ở chương tự mở lại, bấm Back của trình duyệt/điện thoại', async ({ open, readYesterday }) => {
    await readYesterday(3);
    const p = await open(); await act.subject(p, 'Pháp luật');
    await act.back(p); check(await where(p) === CHAPTERS, `Back → ${await where(p)}`);
    await act.back(p); check(await where(p) === SUBJECTS, `Back tiếp → ${await where(p)}`);
  });

  await group(proto, '6. Đổi tab không tạo thêm bước lùi', async ({ open }) => {
    const p = await open(); await act.program(p, 'Quản lý Quỹ'); await act.subject(p, 'Pháp luật');
    for (const t of ['luyen', 'thi', 'hoc', 'luyen']) await act.tab(p, t);
    await act.back(p); check(await where(p) === SUBJECTS, `đổi 4 tab rồi Back → ${await where(p)}`);
  });

  await group(proto, '7. Lịch sử không phình khi mở/đóng chương nhiều lần', async ({ open }) => {
    const p = await open(); await act.program(p, 'Quản lý Quỹ'); await act.subject(p, 'Pháp luật');
    const h0 = await p.evaluate(() => history.length);
    for (let i = 0; i < 10; i++) { await act.chapter(p, i % 9); await act.backToChapters(p); }
    const h1 = await p.evaluate(() => history.length);
    check(h1 - h0 <= 1, `10 lần mở/đóng chương: số mục lịch sử ${h0} → ${h1}`);
  });

  await group(proto, '8. Tải lại trang (F5) khi đang đọc chương', async ({ open }) => {
    const p = await open(); await act.program(p, 'Quản lý Quỹ'); await act.subject(p, 'Pháp luật'); await act.chapter(p, 4);
    await p.reload(); await settle(p);
    check(await where(p) === 'Chương 5', `F5 → vẫn ở ${await where(p)}`);
    await act.backToChapters(p); check(await where(p) === CHAPTERS, `"Quay lại danh sách chương" → ${await where(p)}`);
    await act.pickSubject(p); check(await where(p) === SUBJECTS, `"Chọn môn khác" → ${await where(p)}`);
    await act.pickProgram(p); check(await where(p) === PROGRAMS, `"Chọn kỳ thi khác" → ${await where(p)}`);
  });

  await group(proto, '9. Kỳ thi CCCM: tự mở lại chương đang đọc rồi quay lại', async ({ open }) => {
    let p = await open(); await act.program(p, 'CCCM'); await act.subject(p, 'Cơ bản'); await act.chapter(p, 4); await p.close();
    p = await open(); await act.subject(p, 'Cơ bản');
    check(await where(p) === 'Chương 5', `hôm sau vào môn → ${await where(p)}`);
    await act.backToChapters(p); check(await where(p) === CHAPTERS, `"Quay lại danh sách chương" → ${await where(p)}`);
  });
}

await suite('http');
await suite('file');
await browser.close(); server.close();
console.log(`\n${failed ? '❌' : '✅'} ${passed}/${passed + failed} kiểm tra đạt`);
process.exit(failed ? 1 : 0);
