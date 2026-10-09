/* Kiểm thử lưu tiến độ THEO THIẾT BỊ và việc gộp dữ liệu "theo tài khoản" của các bản 23/09–07/10.
   Dựng sẵn trên máy: dữ liệu cũ (trước 23/09) + dữ liệu của 2 tài khoản, rồi mở app và kiểm tra.
   Chạy: node tests/storage.mjs [đường-dẫn-index.html]   (mặc định: index.html ở thư mục gốc) */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const file = resolve(process.argv[2] || 'index.html');
const html = readFileSync(file);
const dir = mkdtempSync(join(tmpdir(), 'cccm-'));
writeFileSync(join(dir, 'index.html'), html);
writeFileSync(join(dir, 'seed.html'), '<!doctype html><title>seed</title>');   // trang trống cùng nguồn để ghi dữ liệu mẫu
const server = createServer((q, r) => {
  r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  r.end(q.url.startsWith('/seed') ? '<!doctype html><title>seed</title>' : html);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch();
let passed = 0, failed = 0;
const check = (c, m) => { console.log(`     ${c ? '✅' : '❌'} ${m}`); c ? passed++ : failed++; };

const H = (date, correct) => ({ date, correct, total: 10, pct: correct * 10, pass: false, dur: 60 });
const SEED = {
  /* trước 23/09: lưu theo thiết bị */
  'cccm_coban_history': [H(1000, 5)],
  'cccm_coban_stats': { 1: { seen: 2, correct: 1, wrong: 1 } },
  'cccm_coban_bookmarks': [1, 2],
  /* 23/09–07/10: tài khoản tuan.nt */
  'cccm_tuan.nt_coban_history': [H(3000, 7)],
  'cccm_tuan.nt_coban_stats': { 1: { seen: 1, correct: 1, wrong: 0 }, 5: { seen: 1, correct: 0, wrong: 1 } },
  'cccm_tuan.nt_coban_bookmarks': [2, 3],
  'cccm_tuan.nt_coban_resume': { qid: 7, ts: 5000 },
  'cccm_tuan.nt_lastProgram': 'cchnqlq',
  'cccm_tuan.nt_feedback': [{ id: 'fb1', ts: 10, sid: 'coban', qid: 1, body: 'a', sent: true, done: false }],
  'cccm_tuan.nt_cchnqlq-luat_marks': ['0:1'],
  /* 23/09–07/10: tài khoản thanh.nnt */
  'cccm_thanh.nnt_coban_history': [H(2000, 6)],
  'cccm_thanh.nnt_coban_stats': { 1: { seen: 3, correct: 2, wrong: 1 } },
  'cccm_thanh.nnt_coban_resume': { qid: 9, ts: 9000 },
  'cccm_thanh.nnt_feedback': [{ id: 'fb2', ts: 20, sid: 'coban', qid: 2, body: 'b', sent: true, done: false },
                              { id: 'fb1', ts: 10, sid: 'coban', qid: 1, body: 'a', sent: true, done: false }],
  'cccm_thanh.nnt_cchnqlq-luat_marks': ['0:1', '1:2'],
  'cccm_theme': 'dark',
};
const BROKEN = 'cccm_thanh.nnt_coban_overrides';   // giá trị hỏng (không phải JSON) — phải được giữ nguyên

async function suite(proto) {
  const url = p => proto === 'http' ? `http://127.0.0.1:${server.address().port}/${p}` : 'file://' + join(dir, p);
  console.log(`\n══ ${proto === 'http' ? 'Mở qua web (http)' : 'Nháy đúp file (file://)'} ══`);
  const ctx = await browser.newContext();                 // = một thiết bị
  await ctx.route('**/script.google.com/**', r => r.abort());
  const errors = [];
  const openAs = async user => {                         // mở app ở tab mới, đăng nhập bằng `user`
    const p = await ctx.newPage(); p.setDefaultTimeout(5000);
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(u => { try { sessionStorage.setItem('cccm_auth', JSON.stringify({ u })); } catch {} }, user);
    await p.goto(url('index.html')); await p.waitForTimeout(400); return p;
  };
  const read = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
  const coban = async p => {                             // dòng tiến độ của thẻ môn Cơ bản (kỳ thi CCCM)
    if (await p.locator('#homeCrumb .backbtn').isVisible()) { await p.locator('#homeCrumb .backbtn').click(); await p.waitForTimeout(300); }
    await p.locator('.progcard', { hasText: 'CCCM' }).click(); await p.waitForTimeout(300);
    return (await p.locator('#subGrid .subj', { hasText: 'Cơ bản' }).locator('.prog-line').innerText()).trim();
  };

  const seed = await ctx.newPage();
  await seed.goto(url('seed.html'));
  await seed.evaluate(d => { localStorage.clear(); for (const [k, v] of Object.entries(d)) localStorage.setItem(k, k === 'cccm_theme' ? v : JSON.stringify(v)); }, SEED);   // app lưu mọi thứ dạng JSON, riêng theme là chữ thô
  await seed.evaluate(k => localStorage.setItem(k, '{hỏng'), BROKEN);
  await seed.close();

  console.log('   1. Mở app lần đầu sau khi cập nhật (đăng nhập thanh.nnt): dữ liệu được gộp đúng');
  let p = await openAs('thanh.nnt');
  const hist = await read(p, 'cccm_coban_history');
  check(JSON.stringify((hist || []).map(h => h.date)) === '[3000,2000,1000]', `lịch sử thi: đủ 3 lượt của cả 3 nguồn, mới nhất trước → ${JSON.stringify((hist || []).map(h => h.date))}`);
  const st = await read(p, 'cccm_coban_stats') || {};
  check(JSON.stringify(st[1]) === '{"seen":6,"correct":4,"wrong":2}' && st[5]?.seen === 1, `thống kê câu #1 cộng dồn 2+1+3 = 6 lượt (4 đúng, 2 sai) → ${JSON.stringify(st[1])}`);
  check(JSON.stringify(await read(p, 'cccm_coban_bookmarks')) === '[1,2,3]', `đánh dấu: hợp lại → ${JSON.stringify(await read(p, 'cccm_coban_bookmarks'))}`);
  check((await read(p, 'cccm_coban_resume'))?.qid === 9, `"học tiếp": lấy bản mới nhất (câu #9) → câu #${(await read(p, 'cccm_coban_resume'))?.qid}`);
  check(JSON.stringify((await read(p, 'cccm_feedback') || []).map(f => f.id)) === '["fb2","fb1"]', `góp ý: hợp lại, không trùng → ${JSON.stringify((await read(p, 'cccm_feedback') || []).map(f => f.id))}`);
  check(JSON.stringify(await read(p, 'cccm_cchnqlq-luat_marks')) === '["0:1","1:2"]', `mốc số đã thuộc (môn CCHN): hợp lại → ${JSON.stringify(await read(p, 'cccm_cchnqlq-luat_marks'))}`);
  const left = await p.evaluate(() => Object.keys(localStorage).filter(k => /^cccm_(tuan\.nt|thanh\.nnt)_/.test(k)));
  check(left.length === 1 && left[0] === BROKEN, `đã gộp hết dữ liệu theo tài khoản, chỉ giữ lại 1 khoá hỏng không đọc được → còn ${JSON.stringify(left)}`);
  const bk = await p.evaluate(() => JSON.parse(localStorage.getItem('cccm_backup_tien_do_theo_tai_khoan') || 'null'));
  check(!!bk && bk.data['cccm_tuan.nt_coban_history'] === JSON.stringify(SEED['cccm_tuan.nt_coban_history']) && Object.keys(bk.data).length >= 14,
    `có bản sao lưu dữ liệu gốc (${bk ? Object.keys(bk.data).length : 0} khoá)`);
  check(await p.evaluate(() => localStorage.getItem('cccm_theme')) === 'dark', 'cài đặt giao diện sáng/tối không bị đụng tới');
  check(await p.locator('#home').isVisible() && (await p.locator('#homeCrumb').innerText()).includes('Quản lý Quỹ'), 'mở thẳng kỳ thi đã chọn lần trước (Quản lý Quỹ)');
  const line1 = await coban(p);
  check(line1.includes('3 lượt thi') && line1.includes('2 câu đã luyện'), `thẻ môn Cơ bản: "${line1}"`);
  await p.close();

  console.log('   2. Cùng máy, đăng nhập tài khoản khác (tuan.nt): thấy CÙNG tiến độ');
  p = await openAs('tuan.nt');
  const line2 = await coban(p);
  check(line2 === line1, `thẻ môn Cơ bản: "${line2}"`);
  await p.locator('#subGrid .subj', { hasText: 'Cơ bản' }).click(); await p.waitForTimeout(300);
  await p.locator('#tabs button[data-tab="luyen"]').click(); await p.waitForTimeout(300);
  const qid = +(await p.locator('#qList .q').first().getAttribute('data-id'));
  const before = (await read(p, 'cccm_coban_stats'))[qid]?.seen || 0;
  await p.locator('#qList .q').first().locator('.opt').first().click(); await p.waitForTimeout(300);
  check(((await read(p, 'cccm_coban_stats'))[qid]?.seen || 0) === before + 1, `làm thêm 1 câu (#${qid}) → ghi vào vùng của thiết bị`);
  await p.close();

  console.log('   3. Mở lại app nhiều lần: không gộp lặp, không cộng trùng');
  p = await openAs('thanh.nnt'); await p.reload(); await p.waitForTimeout(400);
  check(((await read(p, 'cccm_coban_stats'))[1]?.seen) === 6 + (qid === 1 ? 1 : 0), `thống kê câu #1 vẫn đúng → ${(await read(p, 'cccm_coban_stats'))[1]?.seen} lượt`);
  check((await read(p, 'cccm_coban_history')).length === 3, `lịch sử thi vẫn 3 lượt`);
  await p.close();

  check(errors.length === 0, `Không có lỗi JavaScript${errors.length ? ': ' + [...new Set(errors)].join(' | ') : ''}`);
  await ctx.close();
}

await suite('http');
await suite('file');
await browser.close(); server.close(); rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? '❌' : '✅'} ${passed}/${passed + failed} kiểm tra đạt`);
process.exit(failed ? 1 : 0);
