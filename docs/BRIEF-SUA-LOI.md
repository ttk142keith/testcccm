# Brief sửa lỗi: áp cho các bản tương tự của app Ôn tập

Kiểm tra trên bản `index.html` build 2026-10-07. Số dòng có thể khác ở bản khác, nên hãy **tìm theo đoạn chữ** trong khung code.

| # | Lỗi | Mức độ | Trạng thái ở bản 07/10 |
|---|---|---|---|
| A | Nút "← Quay lại" về nhầm màn hình | **Cao**: người dùng gặp hằng ngày | Đã sửa trên nhánh, kiểm thử 46/46 |
| B1 | "Nguồn" của câu hỏi chèn vào trang mà không qua `esc()` | Trung bình (bảo mật) | Chưa sửa |
| B2 | `esc()` không mã hoá dấu `"` và `'` | Thấp (lỗi chờ sẵn) | Chưa sửa |
| B3 | Góp ý báo "đã gửi" dù có thể chưa tới nơi | Trung bình | Chưa sửa |
| C | Tiến độ lưu theo tài khoản trong khi tài khoản dùng chung; tiến độ trước 23/09 bị "ẩn" | **Cao** | Đã sửa trên nhánh: lưu theo thiết bị + gộp dữ liệu cũ, kiểm thử 32/32 |
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

## C. Lưu tiến độ theo THIẾT BỊ, không theo tài khoản (bắt buộc khi tài khoản dùng chung)

**Quyết định:** trước mắt nhiều người dùng chung một tài khoản, nên mỗi thiết bị (máy + trình duyệt) là một vùng lưu tiến độ.

**Vấn đề ở các bản từ 23/09 tới 07/10:** hàm `nsKey` thêm tên tài khoản vào khoá lưu (`cccm_<tài khoản>_...`), nên:
- cùng một máy, đăng nhập bằng tài khoản khác là **mất dấu** tiến độ;
- tiến độ học từ **trước 23/09** (khoá không có tên tài khoản) vẫn nằm trên máy nhưng app **không đọc tới**, vì bản 23/09 đổi khoá mà không chuyển dữ liệu.

**Cách sửa:** 2 chỗ.

### C1. Thay hàm `nsKey`
Tìm dòng bắt đầu bằng `const nsKey=k=>{const a=window.__CCCM_AUTH;` (kèm khối chú thích ngay phía trên nó), thay bằng:
```js
/* Tiến độ lưu theo THIẾT BỊ (mỗi máy/trình duyệt một vùng), KHÔNG theo tài khoản:
   trước mắt tài khoản dùng chung nên thiết bị mới phản ánh đúng "một người học".
   Dữ liệu các bản 23/09–07/10 đã lưu theo tài khoản (cccm_<tài khoản>_...) được gộp về đây khi mở app
   (xem mergeAccountStores). Khi có tài khoản cá nhân + lưu trên máy chủ thì mới chuyển sang theo tài khoản. */
const nsKey=k=>'cccm_'+k;
```
Bản nào chưa có `nsKey` (khoá kiểu `'cccm_'+k`) thì vốn đã lưu theo thiết bị: **không cần sửa C**.

### C2. Thêm bước gộp dữ liệu cũ
Dán khối sau **ngay trước** 2 dòng `applyAuth();` và `retryFeedback(true);` ở phần khởi động.
Khối này phải chạy **sau** khi danh sách môn (`SUBJECTS`, kể cả các môn CCHN được thêm bằng `SUBJECTS.push`) đã đầy đủ.
```js
/* ============ gộp tiến độ "theo tài khoản" về "theo thiết bị" ============
   Chạy mỗi lần mở app, chỉ có việc khi trên máy còn khoá dạng cccm_<tài khoản>_<khoá> (bản 23/09–07/10).
   Gộp với dữ liệu theo thiết bị (gồm cả dữ liệu trước 23/09 mà các bản đó không đọc tới), rồi xoá khoá theo tài khoản.
   Bản gốc giữ trong cccm_backup_tien_do_theo_tai_khoan để khôi phục nếu cần. */
function mergeProgressPart(part,a,b){
  if(a==null)return b; if(b==null)return a;
  const arr=x=>Array.isArray(x)?x:[];
  const ts=x=>x&&typeof x==='object'?Math.max(+x.ts||0,+(x.luyen&&x.luyen.ts)||0,+(x.exam&&x.exam.ts)||0):0;
  switch(part){
    case 'history':{                       /* hợp + bỏ trùng, mới nhất trước, tối đa 100 như app */
      const seen=new Set(),out=[];
      arr(a).concat(arr(b)).forEach(h=>{const k=h&&(h.date+'|'+h.correct+'|'+h.total);if(h&&!seen.has(k)){seen.add(k);out.push(h);}});
      return out.sort((x,y)=>(y.date||0)-(x.date||0)).slice(0,100);}
    case 'stats':{                         /* mỗi vùng là những lần làm khác nhau -> cộng dồn */
      const o=Object.assign({},a);
      Object.keys(b||{}).forEach(id=>{const x=o[id]||{},y=b[id]||{};
        o[id]={seen:(x.seen||0)+(y.seen||0),correct:(x.correct||0)+(y.correct||0),wrong:(x.wrong||0)+(y.wrong||0)};});
      return o;}
    case 'overrides':return Object.assign({},a,b);
    case 'bookmarks':case 'marks':return [...new Set(arr(a).concat(arr(b)))];
    case 'feedback':{const m=new Map();arr(a).concat(arr(b)).forEach(i=>{if(i&&i.id&&!m.has(i.id))m.set(i.id,i);});
      return [...m.values()].sort((x,y)=>(y.ts||0)-(x.ts||0));}
    case 'resume':case 'session':return ts(b)>ts(a)?b:a;   /* lấy bản mới nhất */
    default:return b;                       /* lastProgram, luyenView, discCollapsed */
  }
}
function mergeAccountStores(){
  let ls;try{ls=window.localStorage;if(!ls)return;}catch(e){return;}
  const sids=new Set(SUBJECTS.map(x=>x.id)),rests=new Set(['feedback','lastProgram','luyenView','discCollapsed']);
  sids.forEach(sid=>PROG_KEYS.concat('marks').forEach(p=>rests.add(sid+'_'+p)));
  const found={};
  for(let i=0;i<ls.length;i++){
    const key=ls.key(i);if(!key||key.indexOf('cccm_')!==0)continue;
    const body=key.slice(5);
    for(let j=body.indexOf('_');j>0;j=body.indexOf('_',j+1)){   /* tên tài khoản có thể chứa "_" */
      const user=body.slice(0,j),rest=body.slice(j+1);
      if(rests.has(rest)&&!sids.has(user)&&!rests.has(user)){(found[rest]=found[rest]||[]).push(key);break;}
    }
  }
  const restKeys=Object.keys(found);if(!restKeys.length)return;
  try{   /* sao lưu bản gốc trước khi đụng vào; không sao lưu được thì thôi, không gộp */
    const BK='cccm_backup_tien_do_theo_tai_khoan';
    const bk=JSON.parse(ls.getItem(BK)||'{"data":{}}');bk.at=bk.at||Date.now();bk.data=bk.data||{};
    restKeys.forEach(r=>['cccm_'+r].concat(found[r]).forEach(k=>{const v=ls.getItem(k);if(v!=null&&!(k in bk.data))bk.data[k]=v;}));
    ls.setItem(BK,JSON.stringify(bk));
  }catch(e){console.warn('Không sao lưu được, bỏ qua bước gộp tiến độ',e);return;}
  const J=k=>{try{return JSON.parse(ls.getItem(k));}catch(e){return undefined;}};   /* undefined = không đọc được */
  restKeys.forEach(r=>{
    const part=r.slice(r.lastIndexOf('_')+1),done=[];
    let v=J('cccm_'+r);if(v===undefined)v=null;
    found[r].forEach(k=>{const x=J(k);if(x===undefined)return;   /* không đọc được: để nguyên, không xoá */
      v=mergeProgressPart(part,v,x);done.push(k);});
    try{if(v!=null)ls.setItem('cccm_'+r,JSON.stringify(v));done.forEach(k=>ls.removeItem(k));}
    catch(e){console.warn('Không gộp được',r,e);}
  });
}
mergeAccountStores();
```
Cách gộp từng loại dữ liệu:

| Dữ liệu | Cách gộp |
|---|---|
| Thống kê đúng/sai từng câu | **Cộng dồn**: mỗi vùng là những lần làm khác nhau nên không bị đếm trùng |
| Lịch sử thi | Hợp lại, bỏ trùng, mới nhất trước, tối đa 100 như app |
| Đánh dấu ★, mốc số đã thuộc, góp ý | Hợp lại, bỏ trùng |
| "Học tiếp", phiên/bài thi đang làm dở | Lấy bản mới nhất |
| Đáp án admin đã sửa | Hợp lại; trùng câu thì lấy theo tài khoản |
| Kỳ thi chọn lần trước, kiểu hiển thị | Lấy theo tài khoản |

An toàn dữ liệu: trước khi gộp, toàn bộ dữ liệu gốc được sao vào `cccm_backup_tien_do_theo_tai_khoan`. Không sao lưu được thì không gộp.
Giá trị hỏng (không đọc được) được giữ nguyên, không xoá. Mở app nhiều lần cũng không gộp lặp.

**Đánh đổi:** một máy có nhiều người dùng chung (ví dụ máy ở văn phòng) thì những người đó **dùng chung tiến độ**.
Muốn mỗi người một tiến độ trên cùng máy, mỗi người dùng một trình duyệt hoặc một hồ sơ (profile) trình duyệt riêng.

**Kiểm thử:** `node tests/storage.mjs <file.html>` dựng sẵn dữ liệu cũ cùng dữ liệu của 2 tài khoản trên một máy, rồi kiểm tra kết quả gộp,
bản sao lưu, việc mở app nhiều lần và việc đổi tài khoản. Bản 07/10 đạt 4/32, bản đã sửa đạt 32/32.

## D. Giới hạn cổng đăng nhập (không sửa được ở bản tĩnh)
Khi khôi phục phiên, app chỉ kiểm tra **tên tài khoản** trong `sessionStorage`. Ai biết tên (tên đang nằm trong file)
là vào được, kể cả tài khoản quản trị. Thêm kiểm tra ở trình duyệt cũng không giải quyết được, vì mọi thứ dùng để kiểm tra
đều nằm sẵn trong file. Chỉ khắc phục được bằng máy chủ (cấu phần 2–3 trong `docs/LO-TRINH-NANG-CAP.md`).
Hãy coi cổng này là "rào chắn xã giao", không phải bảo mật.
