# Brief tổng quát: phát hiện và sửa 5 lỗi hay gặp ở app web chạy trên trình duyệt

Dùng cho các app tương tự app Ôn tập, kể cả khi tên hàm và cấu trúc code khác hẳn. Cụ thể là app:
- viết bằng HTML/JavaScript (một hoặc nhiều file), có **nhiều cấp màn hình** (danh sách → mục → chi tiết);
- lưu dữ liệu trên trình duyệt (`localStorage`);
- có thể có đăng nhập ngay trong trang và gửi dữ liệu đi bằng `fetch`.

Mỗi lỗi gồm: **người dùng thấy gì → tìm trong code ở đâu → nguyên tắc sửa → code mẫu → cách tự kiểm tra**.
Code mẫu ở mục 1 và 2 đã chạy thử trên một app mẫu 4 cấp màn hình (15/15 kiểm tra đạt).
Đây là **khuôn mẫu**: phải chỉnh cho khớp với cách đặt địa chỉ và khoá lưu của từng app.

| # | Lỗi | Mức độ | Dấu hiệu nhanh trong code |
|---|---|---|---|
| 1 | Nút "← Quay lại" về nhầm màn hình hoặc thoát khỏi app | Cao | `history.back()` / `history.go(-1)` trong nút của app |
| 2 | Đổi cách lưu dữ liệu làm người dùng "mất" tiến độ | Cao | Khoá `localStorage` có tiền tố mới (tài khoản, phiên bản) nhưng không có bước chuyển dữ liệu |
| 3 | Chèn dữ liệu vào trang không mã hoá (XSS) | Trung bình | `innerHTML` với `${...}` không bọc hàm mã hoá; hàm mã hoá thiếu `"` `'` |
| 4 | Báo "đã gửi" khi chưa chắc dữ liệu tới nơi | Trung bình | `fetch(..., {mode:'no-cors'})` rồi coi là thành công |
| 5 | Đăng nhập/phân quyền chỉ nằm trong trang | Giới hạn thiết kế | Danh sách tài khoản/mật khẩu (kể cả đã băm) nằm trong file JS/HTML |

---

## 1. Nút "← Quay lại" về nhầm màn hình

**Người dùng thấy:**
- App tự mở lại màn đang xem dở (hoặc mở từ đường link). Bấm "← Quay lại" thì nhảy **quá một cấp**.
- Nút "← Về danh sách X" (cách 2 cấp) chỉ lùi **1 cấp**.
- Bấm Back của điện thoại vài lần thì **thoát khỏi app** sớm hơn mong đợi.

**Tìm trong code:**
- `history.back()`, `history.go(-1)`, `window.history.back` nằm trong `onclick` của nút trong app.
- Chỗ gọi `history.pushState` **một lần** để nhảy xuống nhiều cấp: khôi phục phiên cũ, mở từ link, "học tiếp".

**Nguyên nhân gốc:** lùi lịch sử 1 bước chỉ đúng khi bước trước chắc chắn là màn cha.
Khi app nhảy thẳng nhiều cấp trong 1 bước, giả định này sai.

**Nguyên tắc sửa:**
1. Mỗi mục lịch sử do app thêm = **đúng 1 cấp màn hình**. Nhảy xuống nhiều cấp thì thêm đủ từng cấp ở giữa.
2. Mỗi nút "← ..." phải **biết cấp của màn đích**. Lùi lịch sử đúng số cấp nếu chắc chắn phía sau là màn cha,
   nếu không thì chuyển thẳng tới màn đích.
3. Đổi tab cùng cấp thì **thay** mục lịch sử (`replaceState`), không **thêm** mục mới.
4. Khi xử lý sự kiện `popstate` (người dùng bấm Back/Tiến) thì chỉ vẽ lại màn hình, **không** thêm lịch sử.

**Code mẫu** (dạng địa chỉ `#/cấp1/cấp2/cấp3`; app khác dạng thì chỉ viết lại `levels`):
```js
/* ===== MẪU: điều hướng theo cấp màn hình (dán vào app, chỉ viết lại hàm levels nếu địa chỉ khác dạng #/a/b/c) ===== */
/* levels(url): các địa chỉ từ gốc tới url, mỗi phần tử = 1 cấp màn hình. levels('#/a/b') = ['#/','#/a','#/a/b'] */
function levels(url){
  var p=(url||'').replace(/^#\/?/,'').split('/').filter(Boolean),out=['#/'];
  for(var i=1;i<=p.length;i++)out.push('#/'+p.slice(0,i).join('/'));
  return out;
}
function depth(url){return levels(url).length-1;}
/* Đi XUỐNG màn sâu hơn (mở mục, tự khôi phục màn đang xem dở...): thêm đủ từng cấp còn thiếu, mỗi cấp 1 mục lịch sử.
   n = số bước có thể lùi mà vẫn rơi đúng vào màn cha. */
function navPush(url){
  var here=location.hash||'#/';if(here===url)return;
  var chain=levels(url),i=chain.indexOf(here),st=history.state||{},n;
  if(i<0){n=-1;i=chain.length>1?0:-1;}          /* màn đang đứng không phải cấp cha của màn mới */
  else n=st.up?(st.n==null?1:st.n):0;
  for(var k=i+1;k<chain.length;k++)history.pushState({up:1,n:++n},'',chain[k]);
}
/* Đổi màn CÙNG cấp (đổi tab...) hoặc sau khi chuyển thẳng: thay mục hiện tại, không thêm bước Back */
function navReplace(url){
  var here=location.hash||'#/';
  var keep=depth(url)===depth(here)?(history.state||{}):{};
  history.replaceState(Object.assign({},keep),'',url);
}
/* Nút "← ..." trong app. toDepth = cấp của màn đích; goDirect = hàm vẽ thẳng màn đích rồi gọi navReplace(địa chỉ đích) */
function navUp(toDepth,goDirect){
  var st=history.state||{},k=depth(location.hash)-toDepth;
  if(st.up&&k>0&&k<=(st.n==null?1:st.n))history.go(-k);   /* các mục phía sau đúng là cấp cha → lùi lịch sử */
  else goDirect();                                         /* không chắc (mở từ link, F5...) → chuyển thẳng */
}
```

**Cách gắn vào app:**
| Chỗ trong app | Gọi |
|---|---|
| Mở màn sâu hơn (bấm vào mục, tự khôi phục màn xem dở, "học tiếp") | vẽ màn → `navPush(địa chỉ màn mới)` |
| Đổi tab cùng cấp | vẽ màn → `navReplace(địa chỉ mới)` |
| Nút "← ..." trong app | `navUp(cấp đích, function(){ vẽ màn đích; navReplace(địa chỉ đích); })` |
| `window.addEventListener('popstate', ...)` | chỉ vẽ lại màn theo `location.hash`, không gọi `navPush` |

Cấp đếm từ 0: màn gốc = 0, mỗi tầng sâu hơn +1.
Nếu địa chỉ có phần không phải một cấp màn hình (ví dụ tên tab `#/môn/luyen`), `levels` phải bỏ qua phần đó,
giống cách app Ôn tập coi `#/kỳ-thi/môn/tab` là một cấp.

**Tự kiểm tra (5 phút):**
1. Đi xuống 3 cấp, bấm Back của trình duyệt 3 lần → lùi lần lượt từng cấp.
2. Xem dở một màn sâu → đóng tab → mở lại để app tự khôi phục → bấm "← Quay lại" → về đúng cấp ngay trên.
3. Ở màn sâu nhất, bấm nút về màn cách 2 cấp → tới đúng màn đó.
4. Ở màn sâu, bấm F5 → các nút "← ..." vẫn về đúng màn.
5. Đổi qua lại vài tab rồi bấm Back → không phải lùi qua từng tab.
6. Vào/ra một màn 10 lần → lịch sử không dài thêm (Back không phải bấm 10 lần).

---

## 2. Đổi cách lưu dữ liệu làm người dùng "mất" tiến độ

**Người dùng thấy:** sau khi cập nhật app, tiến độ, cài đặt hoặc đánh dấu biến mất.
Hoặc đăng nhập tài khoản khác trên cùng máy thì thấy trống.

**Tìm trong code:**
- Hàm tạo khoá lưu, ví dụ `localStorage.setItem('app_' + tênTàiKhoản + '_' + ...)`.
- So với bản trước: tiền tố đã đổi chưa (thêm tên tài khoản, số phiên bản, đổi tên app...)?
- Có khối nào chuyển dữ liệu từ khoá cũ sang khoá mới không? **Không có = dữ liệu cũ vẫn nằm đó nhưng app không đọc tới.**

**Quyết định trước khi sửa: lưu theo thiết bị hay theo tài khoản?**

| Tình huống | Nên lưu theo |
|---|---|
| Nhiều người dùng chung 1 tài khoản | **Thiết bị**: mỗi máy/trình duyệt là một người học |
| Mỗi người một tài khoản, nhưng chưa có máy chủ | Thiết bị, hoặc tài khoản nếu máy dùng chung |
| Mỗi người một tài khoản + có máy chủ | Tài khoản, **lưu trên máy chủ** để đồng bộ nhiều máy |

Đánh đổi khi lưu theo thiết bị: một máy có nhiều người dùng thì những người đó dùng chung tiến độ.
Muốn tách thì mỗi người dùng một trình duyệt hoặc một profile trình duyệt riêng.

**6 quy tắc bắt buộc khi đổi cách lưu:**
1. **Sao lưu trước.** Không sao lưu được thì không làm gì cả.
2. **Gộp theo đúng loại dữ liệu** (bảng dưới), không ghi đè bừa.
3. **Ghi khoá mới thành công rồi mới xoá khoá cũ.**
4. Giá trị hỏng, không đọc được thì **để nguyên**, không xoá.
5. Chạy nhiều lần **không được cộng trùng**: khoá cũ đã gộp thì xoá đi.
6. Chạy **trước mọi lần đọc dữ liệu** khi mở app, và sau khi app đã biết đủ danh sách môn/mục.

| Loại dữ liệu | Cách gộp | Hàm mẫu |
|---|---|---|
| Thống kê đếm (số lần làm, đúng, sai) | Cộng dồn: mỗi nơi là những lần làm khác nhau | `MERGE.sumCounts` |
| Danh sách id (đánh dấu, đã thuộc) | Hợp lại, bỏ trùng | `MERGE.union` |
| Danh sách bản ghi có `id` (góp ý, lịch sử có mã) | Hợp lại theo `id` | `MERGE.unionById` |
| Trạng thái "đang dở" có thời điểm `ts` (học tiếp, bài thi dở) | Lấy bản mới nhất | `MERGE.newest` |
| Cài đặt | Giữ giá trị đang dùng | `MERGE.keepNew` |

Lịch sử không có `id` (ví dụ danh sách lượt thi): hợp lại, bỏ trùng theo thời điểm + điểm số, sắp xếp mới nhất trước,
và giữ giới hạn số dòng như app đang dùng.

**Code mẫu:**
```js
/* ===== MẪU: đổi cách đặt khoá lưu mà không làm mất dữ liệu. Chạy 1 lần lúc mở app, TRƯỚC mọi lần đọc dữ liệu ===== */
function migrateStorage(o){
  /* o.oldKeys(): các khoá kiểu cũ còn trên máy | o.newKeyOf(k): khoá kiểu mới | o.mergeOf(newKey)(hiệnCó, cũ): cách gộp
     o.backupKey: nơi sao lưu bản gốc */
  var ls=window.localStorage,olds=o.oldKeys();if(!olds.length)return;
  try{                                                     /* 1) sao lưu trước; không sao lưu được thì không làm gì */
    var bk=JSON.parse(ls.getItem(o.backupKey)||'{}');
    olds.forEach(function(k){if(!(k in bk))bk[k]=ls.getItem(k);});
    ls.setItem(o.backupKey,JSON.stringify(bk));
  }catch(e){return;}
  function read(k){try{return JSON.parse(ls.getItem(k));}catch(e){return undefined;}}   /* undefined = hỏng */
  olds.forEach(function(k){
    var old=read(k);if(old===undefined)return;             /* 2) hỏng → để nguyên, không xoá */
    var nk=o.newKeyOf(k),cur=read(nk);
    var merged=(cur==null||cur===undefined)?old:o.mergeOf(nk)(cur,old);
    try{ls.setItem(nk,JSON.stringify(merged));ls.removeItem(k);}catch(e){}   /* 3) ghi xong mới xoá khoá cũ */
  });
}
/* Cách gộp thường gặp */
var MERGE={
  sumCounts:function(a,b){var o=Object.assign({},a);Object.keys(b||{}).forEach(function(id){var x=o[id]||{},y=b[id]||{},r={};
    Object.keys(Object.assign({},x,y)).forEach(function(f){r[f]=(+x[f]||0)+(+y[f]||0);});o[id]=r;});return o;},   /* thống kê đếm */
  union:function(a,b){return Array.from(new Set([].concat(a||[],b||[])));},                                     /* danh sách id */
  unionById:function(a,b){var m={};[].concat(a||[],b||[]).forEach(function(i){if(i&&i.id!=null&&!m[i.id])m[i.id]=i;});
    return Object.keys(m).map(function(k){return m[k];});},                                                      /* danh sách bản ghi */
  newest:function(a,b){return ((b&&b.ts)||0)>((a&&a.ts)||0)?b:a;},                                                /* trạng thái mới nhất */
  keepNew:function(a,b){return a;}                                                                               /* cài đặt: giữ giá trị mới */
};
```

**Ví dụ dùng.** Chuyển từ khoá theo tài khoản `app_<tài khoản>_<khoá>` về theo thiết bị `app_<khoá>`.
Biểu thức nhận dạng khoá cũ phải chặt, để không bắt nhầm khoá theo thiết bị:
```js
migrateStorage({
  oldKeys: function(){ return Object.keys(localStorage).filter(function(k){ return /^app_(user1|user2)_/.test(k); }); },
  newKeyOf: function(k){ return k.replace(/^app_[^_]+_/, 'app_'); },
  mergeOf: function(nk){ return /_stats$/.test(nk) ? MERGE.sumCounts : /_marks$/.test(nk) ? MERGE.union
                              : /_resume$/.test(nk) ? MERGE.newest : MERGE.keepNew; },
  backupKey: 'app_backup_truoc_khi_gop'
});
```
Tên tài khoản có thể chứa dấu `_`. Khi đó, nhận dạng bằng danh sách khoá hợp lệ (`<môn>_<loại>`) chắc chắn hơn,
như app Ôn tập đã làm.

**Tự kiểm tra:**
1. Trước khi cập nhật: dùng bản cũ, học vài câu, đánh dấu vài câu, làm 1 bài thi.
2. Cập nhật lên bản mới, mở app → mọi thứ vẫn còn.
3. Tải lại trang 3 lần → các con số không tăng thêm.
4. Nếu đã chọn lưu theo thiết bị: đổi tài khoản trên cùng máy → vẫn thấy cùng tiến độ.

---

## 3. Chèn dữ liệu vào trang không mã hoá (XSS)

**Rủi ro:** dữ liệu chứa `<` có thể làm vỡ trang hoặc **chạy mã lạ**. Dữ liệu đó có thể là nội dung câu hỏi, tên, ghi chú,
góp ý của người dùng, hoặc dữ liệu nhập từ file.

**Tìm trong code:** mọi chỗ `innerHTML = \`...${biến}...\``. Mỗi `${...}` chứa chữ phải được bọc bằng hàm mã hoá,
trừ khi chắc chắn là số hoặc là HTML do chính app tạo ra.

**Sửa:**
```js
// Hàm mã hoá đầy đủ: phải có cả " và ', vì thiếu 2 dấu này thì chèn vào thuộc tính (title="...") vẫn bị lợi dụng
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
// Khi chỉ cần đặt chữ: dùng textContent thay innerHTML, không cần mã hoá
el.textContent = tenNguoiDung;
```
**Tự kiểm tra:** nhập hoặc thêm vào dữ liệu đoạn `<img src=x onerror=alert(1)>`. Trang phải hiện đúng đoạn chữ đó, không bật hộp thoại.

---

## 4. Báo "đã gửi" khi chưa chắc dữ liệu tới nơi

**Tìm trong code:** `mode:'no-cors'`. Ở chế độ này trình duyệt **không cho đọc phản hồi**,
nên `fetch` vẫn "thành công" kể cả khi máy chủ báo lỗi.

**Sửa:** bỏ `no-cors`; máy chủ trả về JSON (ví dụ `{"ok":true}`) và cho phép đọc từ trang khác (CORS).
Chỉ báo thành công khi đọc được `ok:true`. Nếu máy chủ không cho đọc phản hồi, giữ cách gửi cũ
nhưng đổi thông báo thành **"đã gửi đi (chưa xác nhận)"** và giữ bản lưu trên máy để gửi lại.

⚠️ Với Google Apps Script: tôi **chưa kiểm chứng** cấu hình nào cho phép đọc phản hồi từ trang khác. Phải thử thật trước khi đổi.

---

## 5. Đăng nhập/phân quyền chỉ nằm trong trang

**Tìm trong code:** danh sách tài khoản (kể cả mật khẩu đã băm) nằm trong file; quyền admin là một biến JavaScript;
phiên đăng nhập chỉ lưu tên tài khoản trong `sessionStorage`/`localStorage`.

**Sự thật cần biết:** mọi thứ đã gửi tới trình duyệt thì người dùng xem và sửa được. Kiểm tra mật khẩu hay quyền trong trang
**không phải bảo mật**, chỉ là rào chắn xã giao. Thêm kiểm tra ở trình duyệt cũng không vá được.

**Làm được ngay:**
- Không để dữ liệu thật sự nhạy cảm trong file app.
- Không dùng lại mật khẩu này cho dịch vụ khác.
- Nếu file từng công khai thì coi như mật khẩu đã lộ.

**Muốn bảo mật thật:** cần máy chủ xác thực (ví dụ Supabase, Firebase) và nội dung chỉ được gửi cho người có quyền.

---

## Câu lệnh mẫu để nhờ công cụ AI khác rà soát một app

Dán nguyên văn kèm file app:

> Hãy rà soát app web đính kèm theo 5 lỗi sau, **chỉ báo cáo trước, chưa sửa**:
> 1. Nút quay lại trong app dùng `history.back()`/`history.go(-1)`, trong khi có chỗ nhảy xuống nhiều cấp màn hình
>    trong một bước lịch sử (khôi phục phiên, mở từ link, "học tiếp").
> 2. Khoá lưu `localStorage` có tiền tố (tài khoản, phiên bản) mà không có bước chuyển dữ liệu từ khoá cũ.
> 3. Chỗ `innerHTML` chèn biến chữ mà không mã hoá; hàm mã hoá thiếu `"` hoặc `'`.
> 4. `fetch` dùng `mode:'no-cors'` rồi coi là gửi thành công.
> 5. Đăng nhập/phân quyền chỉ kiểm tra trong trang.
>
> Với mỗi lỗi: trích **đúng đoạn code và số dòng** làm bằng chứng, mô tả cách người dùng gặp lỗi.
> Nếu không có lỗi thì nói rõ "không có". Không suy đoán.
> Sau khi tôi duyệt mới sửa, với yêu cầu: sửa tối thiểu, không đổi chỗ không liên quan, giữ nguyên hành vi đang đúng,
> và cho tôi danh sách bước tự kiểm tra cho từng lỗi đã sửa.

---

## Thứ tự làm cho mỗi app

1. Chạy câu lệnh mẫu ở trên (hoặc tự tìm theo mục "Tìm trong code") để biết app có lỗi nào.
2. Sửa theo thứ tự **1 → 2 → 3 → 4**. Mục 5 chỉ cần ghi nhận và xử lý dữ liệu nhạy cảm.
3. Làm đủ phần "Tự kiểm tra" của từng lỗi, trên **cả** điện thoại và máy tính, và cả khi mở file trực tiếp lẫn mở qua web.
4. Nếu app được build từ file nguồn: sửa ở **file nguồn**, không chỉ ở file đã build.
