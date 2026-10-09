# Brief sửa lỗi: áp cho các bản tương tự của app Ôn tập

Kiểm tra trên bản `index.html` build 2026-10-07. Số dòng có thể khác ở bản khác, nên hãy **tìm theo đoạn chữ** trong khung code.

| # | Lỗi | Mức độ | Trạng thái ở bản 07/10 |
|---|---|---|---|
| A | Nút "← Quay lại" về nhầm màn hình | **Cao**: người dùng gặp hằng ngày | Đã sửa trên nhánh, kiểm thử 46/46 |
| B1 | "Nguồn" của câu hỏi chèn vào trang mà không qua `esc()` | Trung bình (bảo mật) | Chưa sửa |
| B2 | `esc()` không mã hoá dấu `"` và `'` | Thấp (lỗi chờ sẵn) | Chưa sửa |
| B3 | Góp ý báo "đã gửi" dù có thể chưa tới nơi | Trung bình | Chưa sửa |
| C | Lưu tiến độ theo từng tài khoản (`nsKey`) | Chỉ cần kiểm tra | Bản 07/10 **đã có**; xem các bản khác có chưa |
| D | Cổng đăng nhập: chỉ cần biết tên tài khoản là vào được | Giới hạn thiết kế | Không sửa được ở bản tĩnh |

---

## A. Nút "← Quay lại" về nhầm màn hình (bắt buộc sửa)

**Bản nào bị:** có điều hướng theo địa chỉ `#/...` với hàm `goUp(fallback)` dùng `history.back()`,
**và** khi vào môn thì app tự mở lại chương đang đọc dở.

**Triệu chứng:**
1. Đang đọc dở một chương; hôm sau vào lại môn, app tự mở chương đó. Bấm "← Quay lại danh sách chương"
   lại về **danh sách môn** (Luật / Chuyên môn), không về danh sách chương.
2. Đang đọc chương, bấm "← Chọn môn khác" thì chỉ về **danh sách chương**.
3. Sau khi app tự mở lại chương, bấm Back của trình duyệt/điện thoại 2 lần là **thoát khỏi app**.

**Nguyên nhân:** các nút "← ..." lùi lịch sử trình duyệt đúng 1 bước, với giả định bước trước luôn là màn cha.
Khi vào môn, app tự mở lại chương trong **một bước** lịch sử, bỏ qua bước "danh sách chương".

**Cách sửa:** 4 chỗ, tất cả nằm trong phần điều hướng.

### A1. Thay nguyên khối `syncRoute` + `goUp`

Tìm khối này:
```js
function syncRoute(push){
  if(_routing||_navHold||!_routeReady)return;
  var h=currentHash();if(location.hash===h)return;
  try{
    if(push)history.pushState({app:1,up:1},'',h);
    else history.replaceState(Object.assign({},history.state||{},{app:1}),'',h);
  }catch(e){try{if(push)location.hash=h;else location.replace(h);}catch(e2){}}
}
function goUp(fallback){
  if(!_routing&&_routeReady&&history.state&&history.state.up)history.back();
  else fallback();
}
```
Thay bằng:
```js
/* Chuỗi cấp màn hình dẫn tới 1 địa chỉ: #/ → #/kỳ-thi → #/kỳ-thi/môn/tab → #/kỳ-thi/môn/hoc/chương (cấp 0 → 3) */
function routeChain(h){
  var p=(h||'').replace(/^#\/?/,'').split('/').filter(Boolean),c=['#/'];
  if(p[0])c.push('#/'+p[0]);
  if(p[0]&&p[1]&&p[2])c.push('#/'+p.slice(0,3).join('/'));
  if(p[0]&&p[1]&&p[2]==='hoc'&&p[3]!=null)c.push('#/'+p.slice(0,4).join('/'));
  return c;
}
function routeDepth(h){return routeChain(h).length-1;}
function syncRoute(push){
  if(_routing||_navHold||!_routeReady)return;
  var h=currentHash(),here=location.hash||'#/';if(here===h)return;
  try{
    if(push){
      /* Thêm đủ từng cấp còn thiếu giữa màn đang đứng và màn mới, mỗi cấp 1 mục lịch sử.
         n = số bước có thể lùi mà vẫn rơi đúng vào màn cha (goUp dùng để lùi nhiều cấp một lần). */
      var chain=routeChain(h),i=chain.indexOf(here),st=history.state||{},n;
      if(i<0){n=-1;i=chain.length>1?0:-1;}   /* màn đang đứng không phải cấp cha của màn mới */
      else n=st.up?(st.n==null?1:st.n):0;
      for(var k=i+1;k<chain.length;k++)history.pushState({app:1,up:1,n:++n},'',chain[k]);
    }else{
      /* đổi tab: giữ nguyên thông tin lùi; đổi sang cấp khác: mục này không còn lùi theo cấp được */
      var keep=routeDepth(h)===routeDepth(here)?(history.state||{}):{};
      history.replaceState(Object.assign({},keep,{app:1}),'',h);
    }
  }catch(e){try{if(push)location.hash=h;else location.replace(h);}catch(e2){}}
}
/* toDepth = cấp của màn đích: 0 chọn kỳ thi, 1 danh sách môn, 2 trong môn */
function goUp(fallback,toDepth){
  var st=history.state||{},d=routeDepth(location.hash);
  var k=d-(toDepth==null?d-1:toDepth);
  if(!_routing&&_routeReady&&st.up&&k>0&&k<=(st.n==null?1:st.n))history.go(-k);
  else fallback();
}
```
> `routeChain` giả định địa chỉ có dạng `#/kỳ-thi/môn/tab/chương`, với tab Khái niệm tên là `hoc`.
> Nếu bản khác đặt địa chỉ khác, phải chỉnh `routeChain` cho khớp với hàm `currentHash()` của bản đó.

### A2–A4. Thêm cấp đích cho 3 nút

| Tìm | Thay bằng |
|---|---|
| `onclick="goUp(closeChapter)"` (nút "Quay lại danh sách chương") | `onclick="goUp(closeChapter,2)"` |
| `onclick="goUp(closeSubject)"` (nút "Chọn môn khác") | `onclick="goUp(closeSubject,1)"` |
| `onclick="goUp(backToPrograms)"` (nút "Chọn kỳ thi khác") | `onclick="goUp(backToPrograms,0)"` |

Nếu bản nào không có cấp "chọn kỳ thi" (chỉ có danh sách môn → môn → chương), thì cấp sẽ là:
danh sách môn = 0, trong môn = 1, chương = 2. `routeChain` và các số ở 3 nút phải đổi tương ứng.

### Tự kiểm tra bằng tay (5 phút)

1. Vào một môn → Khái niệm → mở chương 3 → **đóng tab**.
2. Mở lại app → vào lại môn đó → app tự mở chương 3.
3. Bấm "← Quay lại danh sách chương" → phải thấy **danh sách chương**.
4. Mở chương bất kỳ → bấm "← Chọn môn khác" → phải thấy **danh sách môn**.
5. Lặp lại bước 1–2, rồi bấm Back của trình duyệt 2 lần → lần lượt: danh sách chương, danh sách môn (không thoát app).

Kiểm thử tự động: `node tests/navigation.mjs <file.html>`. Bộ này có 9 nhóm tình huống × 2 cách mở;
bản lỗi đạt 34/46, bản đúng đạt 46/46. Bộ kiểm thử viết cho cấu trúc 3 kỳ thi của bản 07/10.

---

## B. Lỗi khác còn trong bản 07/10 (nên sửa)

### B1. "Nguồn" của câu hỏi chèn vào trang mà không qua `esc()`
Nếu dữ liệu nguồn có ký tự `<`, trang có thể vỡ hoặc chạy mã lạ.
```js
// tìm:
<span class="src-tag">Nguồn: ${(q.sources||[]).join(', ')}</span>
// thay:
<span class="src-tag">Nguồn: ${esc((q.sources||[]).join(', '))}</span>
```

### B2. `esc()` không mã hoá dấu nháy
Hiện chưa gây lỗi, vì `esc()` chưa được dùng bên trong thuộc tính HTML (`title="..."`, `value="..."`).
Sửa trước để khỏi thành lỗ hổng khi dùng sau này:
```js
// tìm:
const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// thay:
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
```
`String(s??'')` giữ đúng số `0`; bản cũ `(s||'')` biến số 0 thành chuỗi rỗng.

### B3. Góp ý báo "đã gửi" dù có thể chưa tới nơi
`sendFeedback` gửi với `mode:'no-cors'`. Ở chế độ này trình duyệt **không cho đọc phản hồi**,
nên `fetch` vẫn coi là thành công kể cả khi Google Apps Script báo lỗi, và góp ý vẫn bị đánh dấu `sent=true`.

Hướng sửa: bỏ `mode:'no-cors'`, để Apps Script trả về JSON `{"ok":true}` (qua `ContentService`),
và chỉ đánh dấu `sent=true` khi đọc được `ok:true`.
⚠️ Tôi **chưa kiểm chứng** việc Web App của Apps Script cho phép đọc phản hồi từ trang khác (CORS) trong cấu hình của bạn.
Cần thử thật: nếu bị chặn, giữ cách cũ nhưng đổi thông báo thành "đã gửi đi (chưa xác nhận)".

---

## C. Kiểm tra ở các bản khác: tiến độ lưu riêng theo tài khoản
Bản 07/10 đã có `nsKey` (khoá lưu = `cccm_` + tên tài khoản + ...). Bản nào còn khoá kiểu `'cccm_'+k`, không có tên tài khoản,
thì 2 người đăng nhập trên cùng một máy sẽ **dùng chung tiến độ và góp ý**. Hãy chép cách làm `nsKey` từ bản 07/10 sang.

## D. Giới hạn cổng đăng nhập (không sửa được ở bản tĩnh)
Khi khôi phục phiên, app chỉ kiểm tra **tên tài khoản** trong `sessionStorage`. Ai biết tên (tên đang nằm trong file)
là vào được, kể cả tài khoản quản trị. Thêm kiểm tra ở trình duyệt cũng không giải quyết được, vì mọi thứ dùng để kiểm tra
đều nằm sẵn trong file. Chỉ khắc phục được bằng máy chủ (cấu phần 2–3 trong `docs/LO-TRINH-NANG-CAP.md`).
Hãy coi cổng này là "rào chắn xã giao", không phải bảo mật.
