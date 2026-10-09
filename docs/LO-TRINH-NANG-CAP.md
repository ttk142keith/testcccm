# Lộ trình nâng cấp: từ file tĩnh lên hệ thống có tài khoản và thu phí

Tài liệu này là "bản đồ" chung giữa bạn và Claude. Mỗi cấu phần làm xong thì đánh dấu `[x]`,
và ghi ngày hoàn thành. Phiên làm việc mới chỉ cần đọc file này là biết đang ở đâu.

## Đích đến

```
Trình duyệt người dùng                Supabase (backend dựng sẵn)                 Ngân hàng / SePay
web/ trên Cloudflare Pages  ⇄  • Đăng nhập: Google, email               ⇐  báo "có tiền về" (webhook)
(chỉ có giao diện,             • Database + luật phân quyền theo hàng (RLS)
 không chứa nội dung)          • Hàm xử lý thanh toán (Edge Function)
```

## 4 nguyên tắc không được vi phạm

1. **Nội dung trả phí chỉ rời server khi người hỏi có quyền.** Database tự kiểm tra (RLS) trước khi trả từng câu hỏi.
   Không bao giờ gửi sẵn toàn bộ về trình duyệt rồi "ẩn đi", vì người dùng luôn xem được mọi thứ đã tới trình duyệt.
2. **Không tin bất cứ điều gì trình duyệt tự khai**: danh tính, quyền admin, số tiền, trạng thái "đã thanh toán".
3. **Không commit và không dán vào chat** các bí mật: khoá secret/service_role, mật khẩu database, khoá API thanh toán.
4. **Mỗi cấu phần phải có kiểm thử tự động đạt** rồi mới sang cấu phần tiếp theo.

## Các mức truy cập

| Mức | Cách có được | Xem được gì |
|---|---|---|
| Chờ duyệt | Đăng ký bằng email (mặc định) | Chỉ màn hình "đang chờ duyệt" |
| Miễn phí | Đăng nhập Google, hoặc được admin duyệt | Phần nội dung miễn phí |
| Đầy đủ | Thanh toán, hoặc admin cấp (cho người quen) | Toàn bộ, theo thời hạn |

Các lựa chọn mặc định trên (Google vào thẳng, email chờ duyệt) là **cấu hình trong database**, đổi được mà không cần sửa code.

## Danh sách cấu phần

- [ ] **1. Tách nội dung khỏi giao diện** — đã làm trên bản 16/09, **cần làm lại trên bản 07/10** (xem bên dưới)
- [ ] **2. Nền móng dữ liệu & phân quyền (Supabase)**
- [ ] **3. Đăng nhập Google + đưa bản mới lên Cloudflare Pages**
- [ ] **4. Trang quản trị: duyệt, cấp quyền, khoá tài khoản**
- [ ] **5. Giao diện miễn phí / trả phí**
- [ ] **6. Dữ liệu người dùng lên server** (tiến độ, góp ý, đáp án admin sửa dùng chung)
- [ ] **7. Đăng ký bằng email + quên mật khẩu** (cần dịch vụ gửi email riêng)
- [ ] **8. Thanh toán thủ công** (chuyển khoản, admin bấm xác nhận)
- [ ] **9. Thanh toán tự động** (SePay báo tiền về → tự mở khoá)
- [ ] **10. Chuyển chính thức & pháp lý** (tên miền, tắt GitHub Pages, chính sách, thuế)

---

### 1. Tách nội dung khỏi giao diện ⚠️ cần làm lại

> **Trạng thái 2026-10-09:** phần dưới đây được làm trên bản `index.html` ngày 16/09. Bản 07/10 đã thêm cấp "chọn kỳ thi"
> (CCCM, CCHN Môi giới, CCHN Quản lý quỹ), các tab Mốc số / Công thức / Review đề, cơ chế điều hướng theo địa chỉ,
> và dữ liệu CCHN được khai báo trong phần code. Vì vậy `web/` và `tools/extract-content.mjs` đã lỗi thời,
> và `npm run test:web` sẽ báo sai cho tới khi làm lại.
>
> **Cần chốt một nơi sửa code duy nhất.** Đề xuất: bạn tiếp tục phát triển như hiện nay; khi sẵn sàng sang cấu phần 2
> thì tạm dừng thêm tính năng vài ngày, Claude tách lại từ bản mới nhất (đã có script, làm lại nhanh),
> và từ đó mọi thay đổi chỉ làm trong `web/`. Sửa song song ở hai nơi chắc chắn sẽ lệch nhau.

**Mục tiêu:** app không còn nhúng sẵn 1.725 câu hỏi trong trang, mà tải theo từng môn qua một "cửa" duy nhất (`web/js/content.js`).
Đây là điều kiện bắt buộc để chặn nội dung trả phí ở các bước sau.

**Đã làm:**
- `tools/extract-content.mjs`: đọc `index.html` cũ, tách ra `content/*.json` và kiểm tra dữ liệu
  (trùng mã, đáp án không nằm trong phương án…). Kết quả: 8 môn, 1.725 câu, 717 câu có đáp án gốc, 58 chương, 0 lỗi.
- `web/`: giao diện tách thành `index.html` + `css/app.css` + các file `js/`. Logic giữ nguyên, chỉ sửa 4 chỗ dùng dữ liệu nhúng
  (`renderHome`, `openSubject`, `resumeStudy`, `fbApply`) để tải nội dung bất đồng bộ.
- `tests/smoke.mjs`: chạy cùng một kịch bản trên bản cũ và bản mới rồi so sánh 20 chỉ số
  (mở môn, đọc chương, luyện đề, tìm kiếm, thi thử, chấm điểm, lịch sử, học tiếp, xuất tiến độ, đổi giao diện),
  kiểm tra cả trường hợp thiếu nội dung và màn hình điện thoại. Kết quả: 27/27 đạt.

**Không thay đổi:** `index.html` ở thư mục gốc (bản đang chạy trên GitHub Pages) được giữ nguyên ở bước này. Người dùng hiện tại không bị ảnh hưởng.

**Chạy thử trên máy (không bắt buộc):** cài Node.js 20 trở lên, rồi chạy:
```
npm install
npm run extract     # sinh content/ từ index.html
npm run dev         # mở http://localhost:8080/web/
npm run test:web    # kiểm thử bản tách (so với bản cũ)
```
Bản mới **không còn mở được bằng cách nháy đúp file**: trình duyệt chặn đọc file JSON qua `file://`, nên phải chạy qua máy chủ như trên.
Khi lên web thật (cấu phần 3), điều này không còn là vấn đề.

---

### 2. Nền móng dữ liệu & phân quyền

**Mục tiêu:** dữ liệu nằm trong database; mỗi yêu cầu đọc đều qua luật phân quyền. Chưa đổi giao diện.

**Bạn làm** (khoảng 20 phút, xem mục "Chuẩn bị cho cấu phần 2" ở cuối):
tạo project Supabase, mở kết nối mạng cho môi trường Claude, lưu khoá bí mật vào cài đặt môi trường, trả lời 4 câu hỏi sản phẩm.

**Claude làm:**
- File SQL tạo bảng: `profiles` (trạng thái, vai trò), `subjects`, `chapters`, `questions` (có cột `access`: free/paid),
  `entitlements` (quyền đầy đủ + hạn dùng), `plans`, `orders`, `progress`, `answer_overrides`, `feedback`, `app_settings`.
- Luật RLS cho từng bảng và các hàm `is_admin()`, `has_full_access()`.
- Chặn leo thang quyền: người dùng không tự sửa được `role`, `status` hay hạn dùng của chính mình.
- Kiểm thử RLS tự động với 5 vai: khách chưa đăng nhập, chờ duyệt, miễn phí, đã trả phí, admin.
- Nạp 1.725 câu + 58 chương vào Supabase.

**Đạt khi:** dùng khoá công khai gọi thẳng API mà không có quyền thì **không lấy được** câu trả phí nào; mọi kiểm thử RLS đều đạt.

### 3. Đăng nhập Google + đưa bản mới lên mạng

**Bạn làm:**
- Google Cloud Console: tạo OAuth Client (loại Web). Màn hình đồng ý chỉ xin quyền `openid`, `email`, `profile`
  và **không tải logo**, để không phải qua bước xác minh của Google.
  Nhớ chuyển trạng thái sang **In production**: nếu để *Testing* thì tối đa 100 người dùng thử và phiên đăng nhập hết hạn sau 7 ngày.
- Dán Client ID/Secret vào Supabase → Authentication → Providers → Google.
- Tạo tài khoản Cloudflare, kết nối repo, thư mục xuất bản = `web`.

**Claude làm:** màn hình đăng nhập mới; **xoá hẳn** `web/js/auth-legacy.js` (danh sách tài khoản và mật khẩu cũ);
màn hình "đang chờ duyệt"; `content.js` chuyển sang đọc từ Supabase.

**Đạt khi:** đăng nhập Google trên địa chỉ `*.pages.dev`, hồ sơ được tạo tự động, chỉ thấy đúng phần được phép.

### 4. Trang quản trị

**Claude làm:** `web/admin.html` gồm danh sách chờ duyệt, duyệt/từ chối/khoá, cấp quyền đầy đủ có thời hạn
(cho người quen hoặc 5 người dùng hiện tại), xem đơn hàng. Mọi thao tác đều được database kiểm tra `is_admin()`,
không dựa vào việc ẩn nút trên giao diện.

**Bạn làm:** chạy 1 lệnh SQL để tự cấp quyền admin cho tài khoản của mình.

### 5. Giao diện miễn phí / trả phí

Câu và chương bị khoá hiện biểu tượng 🔒 kèm số lượng ("còn 1.500 câu dành cho gói đầy đủ").
Con số này lấy từ một hàm **chỉ trả về số đếm, không trả nội dung**. Thi thử chỉ rút đề từ phần người dùng được xem.

### 6. Dữ liệu người dùng lên server

> **Lưu ý 2026-10-09:** hiện tài khoản dùng chung nên tiến độ đang lưu **theo thiết bị** (xem `docs/BRIEF-SUA-LOI.md` mục C).
> Chỉ đồng bộ tiến độ lên server theo tài khoản **sau khi** mỗi người có tài khoản riêng (đăng nhập Google, cấu phần 3).
> Nếu đồng bộ khi tài khoản còn dùng chung, tiến độ của nhiều người sẽ trộn vào nhau.

Thay ruột của object `LS` (25 lời gọi đều đi qua đây) bằng "bộ đệm trên máy + đồng bộ lên server".
Sửa luôn 2 lỗi hiện có: đáp án admin sửa chỉ hiện trên máy admin;
góp ý báo "đã gửi" mà không chắc đã tới nơi.
Người dùng cũ: Xuất tiến độ ra file từ bản cũ → Nhập vào bản mới → tự đồng bộ lên tài khoản.

### 7. Đăng ký bằng email

Email mặc định của Supabase **chỉ gửi tới thành viên trong dự án và giới hạn khoảng 2 email/giờ**,
nên không dùng được cho người dùng thật. Cần một dịch vụ gửi email riêng (ví dụ Resend, Brevo) và một tên miền.
Vì vậy cấu phần này đặt **sau** đăng nhập Google.

### 8. Thanh toán thủ công

Người dùng chọn gói → hệ thống tạo đơn kèm **mã chuyển khoản duy nhất** và số tiền **lấy từ bảng `plans` trong database**
(không lấy từ trình duyệt) → người dùng chuyển khoản → admin đối chiếu sao kê, bấm "Đã nhận tiền" → quyền đầy đủ được cộng thêm thời hạn.
Bắt đầu thu tiền được ngay mà không cần ký hợp đồng với cổng thanh toán.

### 9. Thanh toán tự động

SePay theo dõi biến động số dư tài khoản ngân hàng (hỗ trợ cả tài khoản cá nhân) và gửi webhook tới một Edge Function trên Supabase.
Hàm này kiểm tra khoá xác thực, tìm mã đơn trong nội dung chuyển khoản, đối chiếu số tiền, rồi mở khoá.
Mỗi giao dịch chỉ được xử lý **một lần** (chống ghi nhận trùng), và toàn bộ dữ liệu webhook được lưu lại để đối soát.
**Bảng phí của SePay chưa được kiểm chứng**, cần xem trên sepay.vn trước khi đăng ký.

### 10. Chuyển chính thức & pháp lý

Tên miền riêng; tắt GitHub Pages và **sau đó** mới chuyển repo sang private; chính sách quyền riêng tư,
điều khoản sử dụng, chính sách hoàn tiền; sao lưu định kỳ; thuế và thủ tục thương mại điện tử (xem mục cuối).

---

## Nhật ký sửa lỗi bản hiện hành (`index.html`)

### 2026-10-09 — Nút "Quay lại" về nhầm màn hình

**Triệu chứng** (tái hiện được trên cả web và file mở trực tiếp):
1. Đang đọc dở một chương; hôm sau vào lại môn thì app tự mở chương đó. Bấm "← Quay lại danh sách chương"
   lại về **danh sách môn** (Luật / Chuyên môn) thay vì danh sách chương.
2. Đang đọc chương, bấm "← Chọn môn khác" thì chỉ về **danh sách chương**, chưa ra danh sách môn.
3. Sau khi app tự mở lại chương, bấm Back của trình duyệt/điện thoại 2 lần là **thoát khỏi app**.

**Nguyên nhân:** các nút "← ..." không chuyển thẳng tới màn đích mà lùi lịch sử trình duyệt 1 bước,
với giả định bước trước luôn là màn cha. Khi vào môn, app tự mở lại chương đang đọc **trong một bước**,
bỏ qua mục "danh sách chương", nên lùi 1 bước sẽ về thẳng danh sách môn.

**Cách sửa** (34 dòng, chỉ trong phần điều hướng):
- Mỗi mục lịch sử do app thêm đúng bằng 1 cấp màn hình. Khi tự mở lại chương, app thêm "danh sách chương" rồi mới tới "chương".
- Mỗi nút "← ..." khai báo cấp của màn đích (`goUp(closeChapter,2)`, `goUp(closeSubject,1)`, `goUp(backToPrograms,0)`)
  và lùi đúng số cấp cần thiết. Nếu lịch sử phía sau không khớp (mở từ link, F5) thì chuyển màn trực tiếp.

**Kiểm thử:** `npm test` (`tests/navigation.mjs`): 9 nhóm tình huống × 2 cách mở (web, file).
Bản trước khi sửa đạt 34/46, bản sau khi sửa đạt 46/46.

**Lưu ý:** nếu bạn build `index.html` từ file nguồn trên máy, phải áp **cùng thay đổi** vào file nguồn đó;
nếu không, lần tải lên tiếp theo sẽ ghi đè mất bản sửa.

## Chuẩn bị cho cấu phần 2 (việc của bạn)

1. **Tạo project Supabase:** vào supabase.com → *Sign in with GitHub* → *New project*.
   - Name: `on-tap-cccm` · Region: **Southeast Asia (Singapore)** · Plan: Free
   - *Database password*: bấm Generate rồi lưu vào trình quản lý mật khẩu. **Không gửi mật khẩu này cho ai, kể cả Claude.**
2. **Mở kết nối mạng cho môi trường Claude:** hiện môi trường đang chặn `supabase.com` và `*.supabase.co`.
   Trong phiên Claude Code: menu môi trường trên thanh tiêu đề → *Edit* → *Network access* → thêm tên miền project
   (dạng `abcdxyz.supabase.co`, xem ở Supabase → Project Settings → API) vào *Allowed domains*.
   Hướng dẫn chi tiết: https://code.claude.com/docs/en/cloud-environments#network-access
3. **Lưu khoá bí mật vào cài đặt môi trường, không dán vào chat:** cùng màn hình *Edit* ở trên, mục *Network secrets*
   (hoặc *Environment variables*), thêm:
   - `SUPABASE_URL` = địa chỉ project (`https://abcdxyz.supabase.co`)
   - `SUPABASE_SECRET_KEY` = khoá **secret** (bản cũ gọi là `service_role`) ở Project Settings → API Keys
   Biến môi trường chỉ có hiệu lực ở **phiên mới**. Phiên mới đọc file này để làm tiếp.
4. **Trả lời 4 câu hỏi sản phẩm** (có phương án mặc định, đổi được sau):
   - Ai được vào miễn phí? *Mặc định:* đăng nhập Google vào thẳng; đăng ký email phải chờ duyệt.
   - "Một phần" là gì? *Mặc định:* chương 1 lý thuyết của mỗi môn, cộng khoảng 15% câu hỏi rải đều mọi chủ đề.
   - Gói trả phí? *Mặc định:* trọn bộ 8 môn, theo thời hạn (ví dụ 3, 6, 12 tháng).
   - Giá từng gói?

Nếu không muốn mở kết nối hoặc giao khoá: Claude sẽ sinh file SQL để bạn tự dán vào *SQL Editor* của Supabase.
Cách này chậm hơn, và vì dữ liệu lớn (khoảng 2 MB) nên phải chia nhỏ theo từng môn.

---

## Pháp lý & kinh doanh: cần xử lý trước khi thu tiền

Đây là các điểm Claude đã tra cứu nhưng **chưa đối chiếu văn bản gốc**. Cần hỏi kế toán hoặc luật sư.

- **Thuế:** từ 01/01/2026 bỏ thuế khoán, cá nhân kinh doanh tự kê khai (Nghị quyết 198/2025/QH15).
  Có nguồn nêu ngưỡng doanh thu không chịu thuế GTGT/TNCN là 1 tỷ đồng/năm theo Nghị định 141/2026/NĐ-CP,
  nhưng các nguồn **chưa thống nhất** (200 triệu → 500 triệu → 1 tỷ).
- **Thương mại điện tử:** Luật Thương mại điện tử số 122/2025/QH15 có hiệu lực từ 01/07/2026, hướng dẫn bởi Nghị định 248/2026/NĐ-CP.
  Chưa xác định được thủ tục thông báo website bán hàng áp dụng cho cá nhân.
- **Dữ liệu cá nhân:** Luật 91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định 356/2025/NĐ-CP. Cần chính sách quyền riêng tư
  và sự đồng ý của người dùng. Server Supabase đặt ở nước ngoài, nên cần kiểm tra quy định chuyển dữ liệu ra nước ngoài.
- **Quyền với nội dung:** câu hỏi được biên soạn từ bộ đề và slide bài giảng. Cần xác định quyền sử dụng trước khi bán.
  Phần lớn đáp án do AI biên soạn, nên phải ghi rõ cho người mua.
- **Thương hiệu:** trang đang ghi "VDSC" và dùng bộ nhận diện Rồng Việt. Sản phẩm cá nhân bán ra ngoài thì không nên dùng,
  trừ khi được công ty cho phép.
- **Bộ câu hỏi hiện có đã công khai:** bản đầy đủ đang nằm trong `index.html` công khai và trong lịch sử git.
  Tường phí chỉ thực sự bảo vệ được nội dung **mới hoặc được cập nhật** từ nay về sau.
