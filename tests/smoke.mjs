/* Kiểm thử khói: chạy CÙNG một kịch bản người dùng trên bản cũ (index.html) và bản mới (web/),
   rồi so sánh kết quả. Bản mới phải cư xử y hệt bản cũ.
   Chạy: npm test   (cần đã chạy npm run extract để có thư mục content/) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServer } from '../tools/dev-server.mjs';

const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const server = await startServer(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✅' : '❌'} ${msg}`); if (!ok) failed++; };

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 }, ...opts });
  /* Cổng đăng nhập cũ chỉ kiểm tra tên tài khoản trong sessionStorage — dùng đúng lỗ hổng đó để vào thẳng khi kiểm thử.
     (Cổng này sẽ bị thay bằng Supabase Auth ở cấu phần 3.) */
  await ctx.addInitScript(() => sessionStorage.setItem('cccm_auth', JSON.stringify({ u: 'tuan.nt' })));
  await ctx.route('**/script.google.com/**', r => r.abort());   // không gửi góp ý thật lên Google
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}

async function scenario(label, url, shots) {
  console.log(`\n▶ ${label}  (${url})`);
  const { ctx, page, errors } = await newPage();
  const r = {};
  await page.goto(BASE + url);
  await page.waitForFunction(() => document.querySelectorAll('#subGrid .subj').length > 0);
  r.subjects = await page.locator('#subGrid .subj').count();
  r.homeStripe = (await page.locator('#homeStripe').innerText()).replace(/\s+/g, ' ').trim();
  if (shots) await page.screenshot({ path: SHOTS + '1-trang-chu.png', fullPage: true });

  // Mở môn Cơ bản → tab Khái niệm
  await page.locator('#subGrid .subj').first().click();
  await page.waitForSelector('#subject', { state: 'visible' });
  r.title = await page.locator('#subjTitle').innerText();
  r.subjStripe = (await page.locator('#stripe').innerText()).replace(/\s+/g, ' ').trim();
  r.chapters = await page.locator('#chapList .chap').count();
  await page.locator('#chapList .chap').first().click();
  r.chapterTitle = await page.locator('.chap-detail h2').innerText();
  await page.locator('#chapList .backbtn').click();

  // Tab Luyện đề
  await page.locator('#tabs button[data-tab="luyen"]').click();
  await page.waitForSelector('#qList .q');
  r.firstPage = await page.locator('#qList .q').count();
  await page.locator('#qList .q').first().locator('.opt').first().click();
  r.explainShown = await page.locator('#qList .q').first().locator('.explain').count();
  r.statsSaved = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cccm_coban_stats') || '{}')).length);
  await page.locator('#moreBtn').click();
  r.afterMore = await page.locator('#qList .q').count();
  await page.locator('#fSearch').fill('cổ phiếu');
  r.searchCount = (await page.locator('#luyenCount').innerText()).trim();
  await page.locator('#fSearch').fill('');
  if (shots) await page.screenshot({ path: SHOTS + '2-luyen-de.png' });

  // Tab Thi thử: 5 câu, trả lời hết, nộp bài
  await page.locator('#tabs button[data-tab="thi"]').click();
  await page.locator('#exNum').fill('5');
  await page.locator('#startExam').click();
  r.examQs = await page.locator('#examRun .q').count();
  for (let i = 0; i < r.examQs; i++) await page.locator('#examRun .q').nth(i).locator('.opt').first().click();
  r.examProg = await page.locator('#exProg').innerText();
  await page.locator('#submitExam').click();
  r.scoreFormat = /^\d+\/5$/.test(await page.locator('#examResult .score').innerText());
  if (shots) await page.screenshot({ path: SHOTS + '3-ket-qua-thi.png' });

  // Tab Tiến độ + quay về trang chủ
  await page.locator('#tabs button[data-tab="tiendo"]').click();
  r.history = await page.evaluate(() => JSON.parse(localStorage.getItem('cccm_coban_history') || '[]').length);
  await page.locator('#subject .backbtn').first().click();
  await page.waitForSelector('#home', { state: 'visible' });
  r.homeProgress = (await page.locator('#subGrid .subj').first().locator('.prog-line').innerText()).includes('1 lượt thi');

  // "Học tiếp" — mở môn rồi nhảy tới câu đang học (hàm này nay chờ tải nội dung xong)
  const resume = page.locator('#subGrid .subj').first().locator('.btn-resume');
  r.resumeBtn = await resume.count();
  if (r.resumeBtn) {
    await resume.click();
    await page.waitForSelector('#luyen.show');
    r.resumeOpensLuyen = await page.locator('#tabs button[data-tab="luyen"]').evaluate(b => b.classList.contains('active'));
    await page.locator('#subject .backbtn').first().click();
  }

  // Xuất tiến độ ra file
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
  const exported = JSON.parse(await (await dl.createReadStream()).toArray().then(c => Buffer.concat(c).toString('utf8')));
  r.exportSubjects = Object.keys(exported.progress).join(',');

  // Đổi giao diện sáng/tối
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('#themeBtn').click();
  r.themeToggles = before !== await page.evaluate(() => document.documentElement.dataset.theme);

  r.errors = errors;
  await ctx.close();
  return r;
}

const oldR = await scenario('BẢN CŨ', '/index.html', false);
const newR = await scenario('BẢN MỚI', '/web/index.html', true);

console.log('\n── So sánh ──');
const keys = Object.keys(oldR).filter(k => k !== 'errors');
for (const k of keys) {
  const same = JSON.stringify(oldR[k]) === JSON.stringify(newR[k]);
  check(same, `${k}: ${JSON.stringify(newR[k])}${same ? '' : `  (bản cũ: ${JSON.stringify(oldR[k])})`}`);
}
check(newR.subjects === 8 && newR.homeStripe.includes('1725') && newR.homeStripe.includes('58'), 'Trang chủ: 8 môn, 1725 câu, 58 chương');
check(newR.firstPage === 15 && newR.afterMore === 30, 'Luyện đề: 15 câu/trang, "Xem thêm" ra 30');
check(newR.examQs === 5 && newR.scoreFormat && newR.history === 1, 'Thi thử: 5 câu, chấm điểm, ghi lịch sử');
check(newR.errors.length === 0, `Bản mới không có lỗi JavaScript${newR.errors.length ? ': ' + newR.errors.join(' | ') : ''}`);

// Khi thiếu nội dung (ví dụ đưa web/ lên mạng mà không có content/) phải báo lỗi rõ ràng, không treo trắng
console.log('\n▶ Thiếu nội dung');
{
  const { ctx, page } = await newPage();
  await ctx.route('**/content/**', r => r.fulfill({ status: 404, body: 'Not found' }));
  await page.goto(BASE + '/web/index.html');
  await page.waitForSelector('#subGrid .empty');
  check((await page.locator('#subGrid .empty').innerText()).includes('Không tải được'), 'Hiện thông báo lỗi thân thiện');
  await ctx.close();
}

// Trên màn hình điện thoại
console.log('\n▶ Màn hình điện thoại');
{
  const { ctx, page, errors } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/web/index.html');
  await page.waitForFunction(() => document.querySelectorAll('#subGrid .subj').length === 8);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'Không bị tràn ngang ở chiều rộng 390px');
  await page.screenshot({ path: SHOTS + '4-dien-thoai.png' });
  check(errors.length === 0, 'Không có lỗi JavaScript');
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n❌ ${failed} kiểm tra KHÔNG đạt` : '\n✅ Tất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
