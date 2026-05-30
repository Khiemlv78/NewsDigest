import { SCRAPER_SETTINGS } from '../settings';

/**
 * Google News RSS feeds return encoded article URLs like:
 *   https://news.google.com/rss/articles/CBMie0FVX3lxTE1a...?oc=5
 *
 * These are server-side identifiers (protobuf-encoded), NOT the real article URL.
 * This module resolves them to the original publisher URLs using Google's
 * internal batchexecute API (same approach as the `googlenewsdecoder` Python package).
 *
 * ⚠️ This is an undocumented internal API — may break if Google changes it.
 */

const SETTINGS = SCRAPER_SETTINGS.googleNews;

// ── Public API ────────────────────────────────────────────────────────────────

/** Check if a URL is a Google News encoded article URL. */
export function isGoogleNewsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'news.google.com' && u.pathname.includes('/articles/');
  } catch {
    return false;
  }
}

/**
 * Resolve a Google News encoded URL to the original article URL.
 * Uses Google's internal batchexecute API (2-step):
 *   1. Fetch article page → extract signature + timestamp from HTML
 *   2. POST batchexecute → receive decoded URL
 *
 * @returns The real article URL, or null if resolution fails.
 */
export async function resolveGoogleNewsUrl(googleNewsUrl: string): Promise<string | null> {
  const articleId = extractArticleId(googleNewsUrl);
  if (!articleId) {
    console.log(`[google-news] Invalid URL format: ${googleNewsUrl}`);
    return null;
  }

  try {
    // Step 1: Get decoding params from article page HTML
    const params = await getDecodingParams(articleId);
    if (!params) {
      console.log(`[google-news] Could not get decoding params for ${articleId.substring(0, 30)}...`);
      return null;
    }

    // Step 2: Decode via batchexecute
    const decodedUrl = await decodeViaBatchexecute(params.signature, params.timestamp, articleId);
    if (!decodedUrl) {
      console.log(`[google-news] batchexecute decode failed for ${articleId.substring(0, 30)}...`);
      return null;
    }

    return decodedUrl;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[google-news] resolve_error ${articleId.substring(0, 30)}...: ${msg}`);
    return null;
  }
}

/**
 * Resolve all Google News URLs in a list of articles.
 * Processes sequentially with delay between each resolve to avoid rate limiting.
 * Skips articles whose URL cannot be decoded (they keep the Google News URL).
 *
 * @returns Number of successfully decoded URLs.
 */
export async function resolveGoogleNewsUrls(
  articles: Array<{ url: string }>,
): Promise<number> {
  const googleNewsArticles = articles.filter(a => isGoogleNewsUrl(a.url));
  if (googleNewsArticles.length === 0) return 0;

  const toResolve = googleNewsArticles.slice(0, SETTINGS.maxResolvePerFeed);
  let decoded = 0;

  for (let i = 0; i < toResolve.length; i++) {
    const article = toResolve[i];

    // Delay between requests (skip delay for first URL)
    if (i > 0) {
      await new Promise(r => setTimeout(r, SETTINGS.resolveDelayMs));
    }

    const realUrl = await resolveGoogleNewsUrl(article.url);
    if (realUrl) {
      console.log(`[google-news] ✅ decoded: ${realUrl}`);
      article.url = realUrl;
      decoded++;
    } else {
      console.log(`[google-news] ❌ skipped (will retry next cron): ${article.url.substring(0, 80)}...`);
    }
  }

  if (googleNewsArticles.length > SETTINGS.maxResolvePerFeed) {
    console.log(
      `[google-news] ⚠️ ${googleNewsArticles.length - SETTINGS.maxResolvePerFeed} URLs exceeded maxResolvePerFeed limit`
    );
  }

  return decoded;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Extract the article ID from a Google News URL path. */
function extractArticleId(url: string): string | null {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/');
    const idx = segments.indexOf('articles');
    if (idx >= 0 && idx + 1 < segments.length) {
      return segments[idx + 1];
    }
  } catch { /* invalid URL */ }
  return null;
}

interface DecodingParams {
  signature: string;
  timestamp: string;
}

/**
 * Step 1: Fetch the Google News article page and extract
 * data-n-a-sg (signature) and data-n-a-ts (timestamp) from the HTML.
 */
async function getDecodingParams(articleId: string): Promise<DecodingParams | null> {
  const url = `https://news.google.com/articles/${articleId}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(SETTINGS.resolveTimeoutMs),
  });

  const html = await response.text();
  if (!html) return null;

  const sgMatch = html.match(/data-n-a-sg="([^"]+)"/);
  const tsMatch = html.match(/data-n-a-ts="([^"]+)"/);

  if (!sgMatch || !tsMatch) return null;

  return { signature: sgMatch[1], timestamp: tsMatch[1] };
}

/**
 * Step 2: POST to Google's batchexecute endpoint with signature + timestamp
 * to decode the article URL.
 */
async function decodeViaBatchexecute(
  signature: string,
  timestamp: string,
  articleId: string,
): Promise<string | null> {
  const url = 'https://news.google.com/_/DotsSplashUi/data/batchexecute';
  const rpcId = 'Fbv4je';

  const payload = [
    rpcId,
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${timestamp},"${signature}"]`,
  ];

  const body = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body,
    signal: AbortSignal.timeout(SETTINGS.resolveTimeoutMs),
  });

  if (!response.ok) {
    console.log(`[google-news] batchexecute HTTP ${response.status}`);
    return null;
  }

  const text = await response.text();

  try {
    // Response format: )]}'\n\n[[...data...]]
    const parts = text.split('\n\n');
    if (parts.length < 2) return null;

    const parsed = JSON.parse(parts[1]) as any[];
    // Remove trailing metadata entries
    const data = parsed.slice(0, -2);
    const innerJson = JSON.parse(data[0][2]) as string[];
    return innerJson[1] || null;
  } catch {
    console.log(`[google-news] batchexecute parse error, response: ${text.substring(0, 200)}`);
    return null;
  }
}
