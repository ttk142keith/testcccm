#!/usr/bin/env node
/* Trích nội dung (môn học, câu hỏi, chương lý thuyết) từ file index.html cũ ra content/*.json.
   - Đây là công cụ CHUYỂN ĐỔI một lần: sau khi nội dung đã nằm trong database, không cần dùng nữa.
   - Thư mục content/ KHÔNG được đưa lên web và KHÔNG commit vào git (xem .gitignore):
     nội dung trả phí tuyệt đối không được nằm ở nơi công khai.
   Cách dùng: node tools/extract-content.mjs [index.html] [thư-mục-ra]   (mặc định: index.html → content/) */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const src = resolve(process.argv[2] || 'index.html');
const outDir = resolve(process.argv[3] || 'content');
const html = readFileSync(src, 'utf8');

/* Cắt đúng đoạn literal JS giữa 2 mốc, rồi tính giá trị trong sandbox (không có quyền truy cập máy). */
function literal(startMarker, endMarker, keepTail) {
  const i = html.indexOf(startMarker);
  if (i < 0) throw new Error(`Không tìm thấy mốc bắt đầu "${startMarker}" trong ${src}`);
  const from = i + startMarker.length;
  const j = html.indexOf(endMarker, from);
  if (j < 0) throw new Error(`Không tìm thấy mốc kết thúc của "${startMarker}"`);
  const code = html.slice(from, j + keepTail);
  return vm.runInNewContext('(' + code + ')', Object.create(null), { timeout: 10000 });
}

const subjects = JSON.parse(JSON.stringify(literal('const SUBJECTS=', '\n];', 2)));
const data = JSON.parse(JSON.stringify(literal('const DATA=', '\n};\nconst META=', 2)));
const build = (html.match(/const META=\{build:"([^"]+)"\}/) || [])[1] || '';

const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);

if (!Array.isArray(subjects) || !subjects.length) err('SUBJECTS rỗng hoặc sai kiểu');
const sidSeen = new Set();
for (const s of subjects) {
  for (const k of ['id', 'icon', 'name']) if (!s[k]) err(`Môn thiếu trường "${k}": ${JSON.stringify(s)}`);
  if (sidSeen.has(s.id)) err(`Trùng mã môn: ${s.id}`);
  sidSeen.add(s.id);
  if (!/^[a-z0-9_-]+$/.test(s.id)) err(`Mã môn không hợp lệ cho tên file: ${s.id}`);
}
for (const sid of Object.keys(data)) if (!sidSeen.has(sid)) warn(`DATA có môn "${sid}" không nằm trong SUBJECTS (bỏ qua)`);

const stats = {};
for (const s of subjects) {
  const d = data[s.id];
  if (!d || !Array.isArray(d.questions) || !Array.isArray(d.chapters)) { err(`Môn ${s.id}: thiếu questions/chapters`); continue; }
  const ids = new Set();
  for (const q of d.questions) {
    const where = `Môn ${s.id}, câu #${q.id}`;
    if (!Number.isInteger(q.id)) err(`${where}: id không phải số nguyên`);
    if (ids.has(q.id)) err(`${where}: trùng id`);
    ids.add(q.id);
    if (typeof q.stem !== 'string' || !q.stem.trim()) err(`${where}: thiếu đề bài`);
    if (!Array.isArray(q.options) || q.options.length < 2) { err(`${where}: cần ít nhất 2 phương án`); continue; }
    const keys = q.options.map(o => o.key);
    if (new Set(keys).size !== keys.length) err(`${where}: trùng ký hiệu phương án`);
    if (!keys.includes(q.answer)) err(`${where}: đáp án "${q.answer}" không nằm trong ${keys.join('/')}`);
    if (!q.topic) warn(`${where}: thiếu chủ đề`);
  }
  const chs = new Set();
  for (const c of d.chapters) {
    if (chs.has(c.chapter)) err(`Môn ${s.id}: trùng số chương ${c.chapter}`);
    chs.add(c.chapter);
    if (!c.title || !Array.isArray(c.sections)) err(`Môn ${s.id}, chương ${c.chapter}: thiếu tiêu đề hoặc danh sách mục`);
  }
  stats[s.id] = {
    questions: d.questions.length,
    chapters: d.chapters.length,
    verified: d.questions.filter(q => q.verified).length,
  };
}

if (errors.length) {
  console.error(`❌ ${errors.length} lỗi dữ liệu — không ghi file:\n  ` + errors.slice(0, 50).join('\n  '));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify({ build, source: 'index.html', subjects, stats }, null, 2) + '\n');
for (const s of subjects) {
  const d = data[s.id];
  writeFileSync(resolve(outDir, s.id + '.json'), JSON.stringify({ questions: d.questions, chapters: d.chapters }));
}

let tq = 0, tc = 0, tv = 0;
console.log(`Nguồn: ${src} (build ${build || 'không rõ'})\n`);
console.log('Môn         Câu  Gốc  Chương');
for (const s of subjects) {
  const x = stats[s.id]; tq += x.questions; tc += x.chapters; tv += x.verified;
  console.log(`${s.id.padEnd(10)} ${String(x.questions).padStart(4)} ${String(x.verified).padStart(4)} ${String(x.chapters).padStart(7)}`);
}
console.log(`TỔNG       ${String(tq).padStart(4)} ${String(tv).padStart(4)} ${String(tc).padStart(7)}`);
if (warnings.length) console.log(`\n⚠️  ${warnings.length} cảnh báo:\n  ` + warnings.slice(0, 20).join('\n  '));
console.log(`\n✅ Đã ghi ${subjects.length + 1} file vào ${outDir}`);
