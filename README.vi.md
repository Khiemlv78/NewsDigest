# NewsDigest

Trình tổng hợp tin tức công nghệ hàng ngày bằng AI. Tự động lấy bài viết từ RSS, Reddit, YouTube, Hacker News, GitHub Trending và nhiều nguồn khác — sau đó tóm tắt và chấm điểm bằng Gemini AI.

## Kiến trúc

- **Worker** (Cloudflare Workers) — cron scraper, queue consumer, AI summarizer, REST API
- **Frontend** (SvelteKit trên Cloudflare Pages) — PWA reader

**Stack:** Hono · TypeScript · Cloudflare D1 · Cloudflare Queue · Cloudflare KV · Gemini AI

## Triển khai nhanh

### Yêu cầu

- Node.js 18+
- Tài khoản [Cloudflare](https://dash.cloudflare.com) (free plan là đủ)

### 1. Cài đặt dependencies

```bash
npm install
cd fe && npm install && cd ..
```

### 2. Đăng nhập Cloudflare

```bash
npx wrangler login
```

### 3. Chọn AI backend & lấy API key

NewsDigest hỗ trợ hai chế độ AI backend. **Chọn một trong hai:**

---

#### Tùy chọn A — Gemini API trực tiếp *(đơn giản hơn, khuyên dùng khi tự host)*

Chỉ cần lấy Gemini API key miễn phí — không cần cài đặt Cloudflare AI Gateway.

1. Vào [Google AI Studio](https://aistudio.google.com/apikey) → **Create API key**
2. Copy key → điền vào `GEMINI_API_KEY` trong file `.env`

```bash
cp .env.example .env
```

---

#### Tùy chọn B — Cloudflare AI Gateway *(nâng cao: caching, logging, dashboard giới hạn tốc độ)*

Định tuyến các lệnh gọi Gemini qua Cloudflare để có khả năng quan sát và caching.

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com) → **AI** → **AI Gateway**
2. Click **Create Gateway** → đặt tên (ví dụ `newsdigest`) → Create
3. Trong gateway, click **Providers** → **Add Provider**
4. Chọn **Google AI Studio** → vào [Google AI Studio](https://aistudio.google.com/apikey), tạo API key, dán vào Provider Key. Đặt alias là `default`
5. Từ trang gateway, copy:
   - **Gateway URL** → `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>/google-ai-studio`
   - **Auth token** → từ gateway Settings

```bash
cp .env.example.gateway .env
```

---

#### RapidAPI — YouTube Transcripts (chỉ khi dùng nguồn YouTube)

Dùng để lấy transcript video để AI có thể tóm tắt nội dung YouTube. Bỏ qua nếu bạn không có kênh YouTube nào làm nguồn tin.

1. Vào [yt-api trên RapidAPI](https://rapidapi.com/ytjar/api/yt-api)
2. Đăng ký / đăng nhập → **Subscribe** → chọn gói miễn phí (Basic)
3. Copy **X-RapidAPI-Key** từ phần code examples ở bảng bên phải

#### Admin API Key (tùy chọn)

Bảo vệ các write endpoint (thêm/xóa nguồn, tóm tắt lại). Tạo chuỗi ngẫu nhiên:

```bash
openssl rand -hex 32
```

### 4. Cấu hình môi trường

Điền các key đã lấy ở trên. Xem chú thích trong file `.env` để biết thêm chi tiết.

### 5. Khởi tạo tài nguyên Cloudflare

Lệnh này tạo D1 database, KV namespaces, Queues, Pages project, đặt secrets và chạy DB migration — tất cả đều idempotent (an toàn khi chạy lại):

```bash
npm run cf:init
```

### 6. Deploy

```bash
npm run deploy
```

Lệnh này deploy Worker, build frontend với API URL đúng, và deploy lên Cloudflare Pages.

---

## Tham chiếu API Key

| Key | Nguồn | Bắt buộc | Mục đích |
|---|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | ✅ Tùy chọn A | Gọi Gemini API trực tiếp |
| `AI_GATEWAY_URL` | [Cloudflare AI Gateway](https://dash.cloudflare.com) → AI → AI Gateway | ✅ Tùy chọn B | Gateway URL cho Gemini AI |
| `AI_GATEWAY_TOKEN` | Cùng gateway → Settings | ✅ Tùy chọn B | Token xác thực |
| `RAPIDAPI_KEY` | [RapidAPI — yt-api](https://rapidapi.com/ytjar/api/yt-api) | ☑️ Chỉ khi dùng YouTube | Lấy transcript video YouTube để AI tóm tắt |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | ☑️ Chỉ khi dùng YouTube | Liệt kê video kênh (RSS YouTube đã bị chặn) |
| `ADMIN_API_KEY` | Tự tạo (`openssl rand -hex 32`) | ☑️ Tùy chọn | Bảo vệ write endpoint |

> **Lưu ý:** Chỉ đặt `GEMINI_API_KEY` **hoặc** `AI_GATEWAY_URL` + `AI_GATEWAY_TOKEN` — không dùng cả hai. Nếu `GEMINI_API_KEY` tồn tại, nó sẽ được ưu tiên.

---

## Tùy chỉnh (Cấu hình Prompt)

Toàn bộ hành vi prompt AI có thể cấu hình qua biến môi trường — không cần thay đổi code. Mặc định tái hiện hành vi tin tức công nghệ tiếng Việt ban đầu; đặt bất kỳ biến nào dưới đây để điều chỉnh NewsDigest cho ngôn ngữ hoặc chủ đề khác.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `PROMPT_OUTPUT_LANGUAGE` | `Vietnamese` | Ngôn ngữ cho tóm tắt AI và digest |
| `PROMPT_TOPIC_PRIORITIES` | `AI/LLM, Security, Dev Tools, Startup/Business` | Các chủ đề ưu tiên (nhận hot_score cao hơn), phân cách bằng dấu phẩy |
| `PROMPT_ALLOWED_TAGS` | `AI, Tech, Security, Business, Vietnam, World, Dev, Science, Crypto, Policy, Entertainment` | Danh sách tag được phép, phân cách bằng dấu phẩy |
| `PROMPT_DIGEST_HEADINGS` | `AI & LLM, Security, Tools & Infrastructure, Startup & Business, Policy & Society` | Các tiêu đề gợi ý trong digest hàng ngày (chỉ là gợi ý) |
| `PROMPT_CUSTOM_CONTEXT` | *(rỗng)* | Lệnh bổ sung thêm vào system prompt — chỉ dùng văn bản thuần |

Ví dụ: để chạy NewsDigest bằng tiếng Anh tập trung vào tài chính và khí hậu:

```bash
PROMPT_OUTPUT_LANGUAGE=English
PROMPT_TOPIC_PRIORITIES="Finance, Climate, Policy, Energy"
PROMPT_ALLOWED_TAGS="Finance, Climate, Policy, Tech, Business, World, Science"
PROMPT_DIGEST_HEADINGS="Markets & Economy, Climate & Energy, Policy, Technology"
PROMPT_CUSTOM_CONTEXT="Focus on Southeast Asian and global markets."
```

---

## Phát triển cục bộ

```bash
# Terminal 1: Worker (localhost:8787)
npm run dev

# Terminal 2: Frontend (localhost:5173)
npm run dev:fe
```

Frontend tự động phát hiện Worker tại `http://localhost:8787` trong dev mode — không cần file `.env.local`.

---

## Ghi chú

- `npm run cf:init` có thể chạy lại để cập nhật secrets hoặc áp dụng lại schema migration.
- Nếu Worker của bạn dùng custom domain, đặt `WORKER_PUBLIC_URL` trong `.env`.
- Không bao giờ commit `.env` hoặc `.dev.vars`.
- Dành cho AI coding agents làm việc với codebase này, xem [AGENTS.md](./AGENTS.md).
