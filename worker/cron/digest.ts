import { Env } from '../types';
import { ArticleRepo, DigestRepo } from '../db';
import { generateDigest } from '../ai/summarizer';
import { getVnDateString } from '../utils/date';

/**
 * Cron Digest — Chạy sau mỗi lần scrape (mỗi 3h).
 * Lấy tất cả bài đã summarized trong ngày hiện tại (VN timezone) →
 * tổng hợp digest → INSERT hoặc UPDATE digest cho ngày đó.
 */
export async function scheduledDigest(env: Env, date?: string) {
  console.log(`📰 Digest cron triggered at ${new Date().toISOString()}`);

  const digestDate = date || getVnDateString();

  // Tính UTC range cho ngày VN
  const dayStartUTC = new Date(`${digestDate}T00:00:00+07:00`);
  const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000);

  const results = await ArticleRepo.findForDigest(
    env.DB,
    dayStartUTC.toISOString(),
    dayEndUTC.toISOString()
  );

  if (results.length === 0) {
    console.log(`📰 No summarized articles for ${digestDate}, skipping digest.`);
    return;
  }

  console.log(`📰 Generating digest for ${digestDate} from ${results.length} articles...`);

  try {
    const digest = await generateDigest(results, env);
    if (!digest) {
      console.log('📰 Digest generation returned null.');
      return;
    }

    await DigestRepo.upsert(env.DB, {
      date: digestDate,
      summaryText: digest.digest_text,
      totalFetched: results.length,
    });

    console.log(`📰 Digest saved for ${digestDate} (${digest.digest_text.length} chars, ${results.length} articles)`);
  } catch (err: any) {
    console.error('❌ Digest generation failed:', err.message);
  }
}
