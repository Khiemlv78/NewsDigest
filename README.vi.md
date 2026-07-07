# NewsDigest

Trình tổng hợp tin tức công nghệ hàng ngày bằng AI. Tự động lấy bài viết từ RSS, YouTube, Hacker News, GitHub Trending và nhiều nguồn khác, riêng Reddit được cào qua browser extension — sau đó tóm tắt và chấm điểm bằng Gemini AI.

## Kiến trúc

- **Worker** (Cloudflare Workers) — cron scraper, queue consumer, AI summarizer, REST API
- **Frontend** (SvelteKit trên Cloudflare Pages) — PWA reader
- **Reddit Extension** (WXT + Svelte) — browser collector tùy chọn cho `old.reddit.com`

**Stack:** Hono · TypeScript · Cloudflare D1 · Cloudflare Queue · Cloudflare KV · Gemini AI

## Triển khai nhanh

### Yêu cầu

- Node.js 18+
- Tài khoản [Cloudflare](https://dash.cloudflare.com) (free plan là đủ)

### 1. Cài đặt dependencies

```bash
npm install
cd fe && npm install && cd ..
cd extension && npm install && cd ..
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

#### Admin API Key

Bảo vệ các write endpoint (thêm/xóa nguồn, tóm tắt lại, nhận dữ liệu từ Reddit extension). Tạo chuỗi ngẫu nhiên:

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
| `ADMIN_API_KEY` | Tự tạo (`openssl rand -hex 32`) | ☑️ Khuyên dùng; UI Reddit extension yêu cầu | Bảo vệ write endpoint và API push của Reddit extension |

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

## Reddit Scraping Extension

Server-side fetching cho Reddit đã bị tắt vì Reddit thường chặn traffic từ Cloudflare Worker/datacenter. Source Reddit vẫn được hỗ trợ, nhưng quá trình cào dữ liệu chạy từ một phiên browser thật bằng extension trong `extension/`.

### Cách hoạt động

1. Thêm Reddit source trong NewsDigest như bình thường, ví dụ `https://www.reddit.com/r/LocalLLaMA/`.
2. Worker cron bỏ qua source có `type = reddit`.
3. Extension lấy danh sách Reddit source đang bật từ `GET /api/sources`.
4. Extension mở `old.reddit.com`, cào hot listing và nội dung bài viết trong tab browser thật.
5. Extension push listing vào `POST /api/reddit/push-listing` và content vào `POST /api/reddit/push-content`.
6. Worker lưu content và enqueue bài viết vào luồng AI summarization như bình thường.

### Cài để dùng local

```bash
cd extension
npm install
npm run build
```

Sau đó load unpacked extension được build tại `extension/.output/chrome-mv3/` trong Chrome hoặc trình duyệt Chromium:

1. Mở `chrome://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked**.
4. Chọn thư mục `extension/.output/chrome-mv3/`.

Mở popup extension và cấu hình:

- **API URL:** `http://localhost:8787` khi dev local, Worker URL đã deploy, hoặc custom Worker domain.
- **Admin Key:** cùng giá trị với `ADMIN_API_KEY`.

Dùng **Scrape All** để cào các Reddit source hiện có. Dùng **Retry Failed** để cào lại các bài Reddit gần đây đã được insert nhưng vẫn thiếu content.

Khi phát triển extension, chạy:

```bash
cd extension
npm run dev
```

---

## Ghi chú

- `npm run cf:init` có thể chạy lại để cập nhật secrets hoặc áp dụng lại schema migration.
- Nếu Worker của bạn dùng custom domain, đặt `WORKER_PUBLIC_URL` trong `.env`.
- Không bao giờ commit `.env` hoặc `.dev.vars`.
- Dành cho AI coding agents làm việc với codebase này, xem [AGENTS.md](./AGENTS.md).
