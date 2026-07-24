/**
 * TimeNation Heritage Guard — in-memory cache of State Chrono-Vault coords.
 * Loaded lazily on first request, invalidated after seeding.
 */
import { db } from "@workspace/db";
import { stateHistoricMinutesTable } from "@workspace/db";

let cache: { set: Set<string>; meta: Map<string, { title: string; category: string }> } | null = null;

export async function loadHeritageCache() {
  if (cache) return cache;
  const rows = await db
    .select({ coord: stateHistoricMinutesTable.timelineCoord, title: stateHistoricMinutesTable.title, category: stateHistoricMinutesTable.category })
    .from(stateHistoricMinutesTable);
  const set  = new Set(rows.map(r => r.coord));
  const meta = new Map(rows.map(r => [r.coord, { title: r.title, category: r.category }]));
  cache = { set, meta };
  return cache;
}

export function invalidateHeritageCache(): void {
  cache = null;
}

export async function isStateHeritageCoord(coord: string): Promise<false | { title: string; category: string }> {
  const c = await loadHeritageCache();
  if (!c.set.has(coord)) return false;
  return c.meta.get(coord) ?? { title: "Государственная собственность", category: "CENTURY_BOUNDARY" };
}

export const HERITAGE_LOCK_CODE = "STATE_HERITAGE_LOCK";
export const HERITAGE_LOCK_TITLE = "🏛️ Неотчуждаемое Государственное Достояние";
export const HERITAGE_LOCK_MSG   =
  "Эта минута входит в реестр великих вех человечества и закреплена за Государственным Хроно-Фондом TimeNation.";
