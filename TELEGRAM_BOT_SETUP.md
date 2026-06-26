# CRAZII Telegram Bot - Hướng dẫn Setup & Deploy

Bot tự động quét tín hiệu CRAZII và gửi về Telegram channel, chạy trên Vercel Serverless + Cron.

## 1. Lấy thông tin Telegram

### Bot Token
- Vào **@BotFather** trên Telegram
- ⚠️ **Token cũ đã lộ → gõ `/revoke` để tạo token mới**
- Copy token mới (dạng `123456:ABC-xxx`)

### Chat ID của channel
Cách lấy `CHAT_ID` cho channel:
1. Thêm bot vào channel làm **Admin** (quyền Post Messages)
2. Đăng 1 tin bất kỳ vào channel
3. Mở: `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Tìm `"chat":{"id":-100xxxxxxxxxx}` → đó là CHAT_ID
   - Channel ID thường bắt đầu bằng `-100`

> Nếu channel có username công khai, có thể dùng `@ten_channel` thay cho ID số.

## 2. Cấu hình biến môi trường trên Vercel

Vào **Vercel Dashboard → Project → Settings → Environment Variables**, thêm:

| Tên biến | Giá trị | Bắt buộc |
|----------|---------|----------|
| `TELEGRAM_BOT_TOKEN` | Token mới từ BotFather | ✅ |
| `TELEGRAM_CHAT_ID` | `-100xxxx` hoặc `@channel` | ✅ |
| `CRAZII_SYMBOLS` | `XAUUSDT,BTCUSDT` | ❌ (mặc định) |
| `CRAZII_TIMEFRAME` | `5m` | ❌ (mặc định 5m) |
| `CRON_SECRET` | chuỗi bí mật bất kỳ | ❌ (khuyên dùng) |

## 3. Deploy

```bash
# Từ thư mục crazii-web
git init
git add .
git commit -m "CRAZII web + telegram bot"
# Push lên GitHub rồi import vào Vercel
```

Hoặc dùng Vercel CLI:
```bash
npm i -g vercel
vercel --prod
```

## 4. Test

Sau khi deploy, mở trình duyệt:
```
https://<your-app>.vercel.app/api/test-telegram
```
Nếu nhận được tin nhắn "Kết nối thành công" trong channel → OK.

Test quét tín hiệu thủ công:
```
https://<your-app>.vercel.app/api/check-signals
```

## 5. Cron tự động

File `vercel.json` cấu hình cron Vercel chạy **1 lần/ngày** (giới hạn Hobby plan):
```json
{ "crons": [{ "path": "/api/check-signals", "schedule": "0 0 * * *" }] }
```
Đây chỉ là backup. Để quét tín hiệu **mỗi 5 phút (24/7)**, dùng cron ngoài miễn phí ở mục dưới.

### ⚠️ Vercel Hobby (free) chỉ cho cron 1 lần/ngày
Nếu để `*/5 * * * *`, deploy sẽ **báo lỗi**:
> "Hobby accounts are limited to daily cron jobs..."

→ Đã đổi về `0 0 * * *` để deploy được.

### ✅ Giải pháp chạy mỗi 5 phút (MIỄN PHÍ) — dùng cron-job.org
1. Đăng ký tài khoản tại [cron-job.org](https://cron-job.org) (free)
2. Tạo cronjob mới:
   - **URL:** `https://<your-app>.vercel.app/api/check-signals`
   - **Schedule:** Every 5 minutes
   - **Request method:** GET
   - Nếu bật `CRON_SECRET`: thêm Header `Authorization` = `Bearer <CRON_SECRET>`
3. Save → cron-job.org sẽ gọi endpoint mỗi 5 phút, bot gửi tín hiệu tự động 24/7.

### Lựa chọn khác
- **Nâng Vercel Pro** (~$20/tháng): để `*/5 * * * *` trong `vercel.json` chạy trực tiếp.

## 6. Cải thiện khi chạy 24/7 (sau khi test ổn)

Hiện tại chống gửi trùng bằng cache trong memory — sẽ **mất khi function cold start**.
Để dedup chính xác 24/7, nên thêm **Vercel KV / Upstash Redis** lưu các tín hiệu đã gửi.
Mình có thể bổ sung khi bạn sẵn sàng.

## Loại tín hiệu được gửi
- **BIG BUY/SELL** (Tam Điểm Hội Tụ) — tín hiệu mạnh nhất
- **Kim Cương Nhấn Chìm (DML)**
- **Đổi màu nến (CCRY/CCYR)**

Mỗi tín hiệu kèm: giá vào, OP, MLP, TP theo KTR±1/2/3, SL gợi ý, và lý do chi tiết.
