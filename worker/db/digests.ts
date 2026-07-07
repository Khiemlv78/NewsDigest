// ── Queries ───────────────────────────────────────────────────────────────

export async function findByDate(
  db: D1Database,
  date: string
): Promise<Record<string, unknown> | null> {
  const { results } = await db.prepare(
    'SELECT * FROM digests WHERE digest_date = ?'
  ).bind(date).all();
  return results?.[0] ?? null;
}

// ── Mutations ─────────────────────────────────────────────────────────────

export async function upsert(
  db: D1Database,
  params: { date: string; summaryText: string; totalFetched: number }
): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO digests (id, digest_date, created_at, updated_at, summary_text, total_fetched)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(digest_date) DO UPDATE SET
       summary_text = excluded.summary_text,
       updated_at = excluded.updated_at,
       total_fetched = excluded.total_fetched`
  ).bind(
    crypto.randomUUID(),
    params.date,
    now,
    now,
    params.summaryText,
    params.totalFetched
  ).run();
}

export async function deleteOlderThanDate(db: D1Database, cutoffDate: string): Promise<number> {
  const result = await db.prepare(
    'DELETE FROM digests WHERE digest_date < ?'
  ).bind(cutoffDate).run();
  return result.meta?.changes ?? 0;
}

export async function deleteByDate(db: D1Database, date: string): Promise<void> {
  await db.prepare('DELETE FROM digests WHERE digest_date = ?').bind(date).run();
}
