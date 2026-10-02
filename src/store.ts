import { generateId } from "./id.ts";

// Global cap on new diagrams per UTC day (M-8). Protects database size, not availability.
export const MAX_SAVES_PER_DAY = 5_000;

export type StoredDiagram = { title: string; code: string; createdAt: number };

export type SaveResult = { ok: true; id: string } | { ok: false; reason: "daily_limit" | "storage" };

export async function saveDiagram(
  db: D1Database,
  diagram: { title: string; code: string },
  now: number = Date.now(),
): Promise<SaveResult> {
  const day = new Date(now).toISOString().slice(0, 10);
  const counter = await db
    .prepare(
      "INSERT INTO daily_counts (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n",
    )
    .bind(day)
    .first<{ n: number }>();
  if (!counter) return { ok: false, reason: "storage" };
  if (counter.n > MAX_SAVES_PER_DAY) return { ok: false, reason: "daily_limit" };

  // A collision of 59-bit random ids is practically impossible; retry covers it anyway.
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = generateId();
    try {
      await db
        .prepare("INSERT INTO diagrams (id, title, code, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, diagram.title, diagram.code, now)
        .run();
      return { ok: true, id };
    } catch (error) {
      if (!String(error).includes("UNIQUE")) return { ok: false, reason: "storage" };
    }
  }
  return { ok: false, reason: "storage" };
}

export async function getDiagram(db: D1Database, id: string): Promise<StoredDiagram | null> {
  const row = await db
    .prepare("SELECT title, code, created_at FROM diagrams WHERE id = ?")
    .bind(id)
    .first<{ title: string; code: string; created_at: number }>();
  return row ? { title: row.title, code: row.code, createdAt: row.created_at } : null;
}
