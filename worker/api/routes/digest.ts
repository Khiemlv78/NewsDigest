import { Hono } from 'hono';
import { Env } from '../../types';
import { DigestRepo } from '../../db';
import { requireAdmin } from '../utils';
import { getVnDateString } from '../../utils/date';

const digest = new Hono<{ Bindings: Env }>();

// ── GET /api/digest ───────────────────────────────────────

/**
 * Trả về digest cho ngày cụ thể (default: hôm nay VN).
 * Query: ?date=YYYY-MM-DD
 */
digest.get('/', async (c) => {
    const dateParam = c.req.query('date');
    const dateStr = dateParam || getVnDateString();

    const result = await DigestRepo.findByDate(c.env.DB, dateStr);
    return c.json({ digest: result ?? null });
});

// ── POST /api/digest ──────────────────────────────────────

/**
 * Manual digest submission.
 * Body: { digest_date?, summary_text }
 */
digest.post('/', async (c) => {
    const authErr = requireAdmin(c);
    if (authErr) return authErr;

    const { digest_date, summary_text } = await c.req.json();
    if (!summary_text) return c.json({ error: 'summary_text required' }, 400);

    const dateStr = digest_date || getVnDateString();

    await DigestRepo.upsert(c.env.DB, {
        date: dateStr,
        summaryText: summary_text,
        totalFetched: 0,
    });

    return c.json({ ok: true, digest_date: dateStr });
});

// ── POST /api/digest/generate ─────────────────────────────

/**
 * Manual trigger digest generation.
 */
digest.post('/generate', async (c) => {
    const authErr = requireAdmin(c);
    if (authErr) return authErr;

    let date = c.req.query('date') || undefined;
    if (!date && c.req.header('content-type')?.includes('application/json')) {
        try {
            const body = await c.req.json();
            date = body.date;
        } catch {}
    }

    const { scheduledDigest } = await import('../../cron/digest');
    await scheduledDigest(c.env, date);
    return c.json({ ok: true, message: `Digest generation triggered for ${date || 'today'}` });
});

export default digest;
