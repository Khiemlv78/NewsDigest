import { extractFromXml, extractFromJson } from '@extractus/feed-extractor';
import { Source, ArticleInput } from '../../types';
import { fetchFeedBuffer, isLikelyHtml, normalizeDate } from '../utils';
import { ContentUnavailableError, ParseError } from '../../errors';
import { SCRAPER_SETTINGS } from '../../settings';
import { isGoogleNewsUrl, resolveGoogleNewsUrls } from '../../utils/google-news';

export async function fetchRSS(source: Source): Promise<ArticleInput[]> {
  const { text, contentType, isJsonFeed } = await fetchFeedBuffer(
    source.url,
    AbortSignal.timeout(SCRAPER_SETTINGS.sourceFetch.rssTimeoutMs)
  );

  if (isLikelyHtml(contentType, text)) {
    throw new ContentUnavailableError(`RSS feed returned HTML for ${source.url}. Please use feed URL (XML).`, source.url);
  }

  let entries: Array<{ id?: string; title?: string; link?: string; description?: string; published?: string }>;

  if (isJsonFeed) {
    // JSON Feed (application/feed+json)
    let json: any;
    try { json = JSON.parse(text); } catch { throw new ParseError(`Invalid JSON Feed for ${source.url}`, source.url); }
    const feed = extractFromJson(json, { descriptionMaxLen: 0 });
    if (!feed) throw new ParseError(`Could not parse JSON Feed for ${source.url}`, source.url);
    entries = feed.entries ?? [];
  } else {
    // RSS / Atom / RDF with namespace + encoding support
    let feed: any;
    try {
      feed = extractFromXml(text, {
        descriptionMaxLen: 0,
        getExtraEntryFields: (entry: any) => {
          // Pull content:encoded (WordPress / general RSS), dc:creator, media:description
          const encoded = entry['content:encoded'] ?? entry['encoded'] ?? '';
          const mediaGroup = entry['media:group'] ?? {};
          const mediaDesc = mediaGroup['media:description'] ?? entry['media:description'] ?? '';
          return {
            // Expose content:encoded as a fallback description
            contentEncoded: typeof encoded === 'string' ? encoded.trim() : '',
            mediaDescription: typeof mediaDesc === 'string' ? mediaDesc.trim() : '',
          };
        },
      } as any);
    } catch (e) {
      throw new ParseError(`Invalid RSS/Atom/RDF payload for ${source.url}: ${e}`, source.url);
    }
    if (!feed) throw new ParseError(`Invalid RSS/Atom/RDF payload for ${source.url}`, source.url);
    entries = feed.entries ?? [];
  }

  // Chỉ lấy bài trong 3 ngày gần nhất, tối đa 10 bài
  const threeDaysAgo = new Date(Date.now() - SCRAPER_SETTINGS.sourceFetch.rssRecentDays * 24 * 60 * 60 * 1000);
  const recent = entries.filter((entry: any) => {
    if (!entry.published) return true; // không có ngày → giữ lại, normalizeDate sẽ dùng now
    return new Date(entry.published) >= threeDaysAgo;
  });

  const mapped = recent.slice(0, SCRAPER_SETTINGS.sourceFetch.rssMaxItems).map((entry: any) => {
    let link = (entry.link ?? '').trim();
    if (link && !/^https?:\/\//i.test(link)) {
      try { link = new URL(link, source.url).toString(); } catch { link = ''; }
    }
    // description: plain text summary only (feed-extractor normalized field or media description)
    // contentEncoded is kept separate — full HTML from content:encoded, NOT merged into description
    const desc = entry.description || entry.mediaDescription || '';
    const contentEncoded: string = entry.contentEncoded || '';
    const item: ArticleInput = {
      url: link,
      title: (entry.title ?? '').trim(),
      description: desc,
      published_at: normalizeDate(entry.published ?? null),
    };
    if (contentEncoded) item.contentEncoded = contentEncoded;
    return item;
  });

  const valid = mapped.filter(item => item.url && item.title);

  // ── Google News URL resolution ──────────────────────────────────────────
  // Google News RSS feeds return encoded URLs (news.google.com/rss/articles/CBMi...)
  // Decode them to real publisher URLs before returning.
  // Articles that fail to decode are skipped — they'll be retried next cron cycle.
  const hasGoogleNewsUrls = valid.some(a => isGoogleNewsUrl(a.url));
  if (hasGoogleNewsUrls) {
    const decoded = await resolveGoogleNewsUrls(valid);
    const remaining = valid.filter(a => !isGoogleNewsUrl(a.url));
    const skipped = valid.length - remaining.length;
    console.log(
      `[rss] google_news_decode: decoded=${decoded} skipped=${skipped} remaining=${remaining.length}`
    );
    // Replace valid array with only successfully decoded + non-Google-News articles
    valid.length = 0;
    valid.push(...remaining);
  }

  // Diagnostics: RSS feed quality summary
  const withEncoded = valid.filter(a => a.contentEncoded && a.contentEncoded.length > 0).length;
  const withRichDesc = valid.filter(a => (a.description?.length ?? 0) > 200).length;
  const avgDescLen = valid.length > 0
    ? Math.round(valid.reduce((s, a) => s + (a.description?.length ?? 0), 0) / valid.length)
    : 0;
  console.log(
    `[rss] ${source.url}: total=${entries.length} recent=${recent.length} valid=${valid.length} ` +
    `content:encoded=${withEncoded}/${valid.length} rich_desc=${withRichDesc}/${valid.length} avg_desc=${avgDescLen}chars` +
    ` (cutoff=${threeDaysAgo.toISOString().slice(0, 10)})`
  );
  return valid;
}
