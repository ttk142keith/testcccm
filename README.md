# Ôn tập Chứng chỉ Chuyên môn Chứng khoán

Ứng dụng ôn thi 8 môn chứng chỉ chuyên môn chứng khoán: học lý thuyết theo chương, luyện đề, thi thử có bấm giờ, theo dõi tiến độ.

**Đang nâng cấp** lên hệ thống có tài khoản, phân quyền và thu phí. Xem [docs/LO-TRINH-NANG-CAP.md](docs/LO-TRINH-NANG-CAP.md).

## Cấu trúc

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Bản cũ, đang chạy trên GitHub Pages. Giữ nguyên cho tới khi chuyển chính thức. |
| `web/` | Bản mới: chỉ có giao diện, nội dung được tải qua `web/js/content.js`. Đây là thư mục sẽ đưa lên mạng. |
| `tools/extract-content.mjs` | Tách nội dung từ `index.html` ra `content/` (không commit) và kiểm tra dữ liệu. |
| `tools/dev-server.mjs` | Máy chủ xem thử trên máy. |
| `tests/smoke.mjs` | Kiểm thử tự động: so sánh hành vi bản cũ và bản mới. |

## Lệnh

```
npm install
npm run extract   # sinh content/ từ index.html
npm run dev       # xem thử: http://localhost:8080/web/
npm test          # chạy kiểm thử
```
