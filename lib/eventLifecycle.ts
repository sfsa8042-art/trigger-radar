import type { TriggerEvent, EventCategory } from './types';

// ── TTL per category (days) ───────────────────────────────────────────────────

export const TTL_DAYS: Record<EventCategory, number> = {
  tender:     30,
  news:       90,
  competitor: 180,
  regulation: 365,
  other:      365, // includes technology / materials
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate expiresAt ISO string from a base date and category TTL.
 */
export function calcExpiresAt(category: EventCategory, baseDate: string): string {
  const base = new Date(baseDate);
  if (isNaN(base.getTime())) {
    // Fallback to now if date is unparseable
    base.setTime(Date.now());
  }
  base.setDate(base.getDate() + TTL_DAYS[category]);
  return base.toISOString();
}

/**
 * Returns true when the event should be considered active.
 * Events without a status field are treated as active (backward compat).
 */
export function isActive(event: TriggerEvent): boolean {
  return !event.status || event.status === 'active';
}

/**
 * Returns a human-readable expiry label and urgency level.
 * Used by EventCard to render the expiry badge.
 */
export function expiryLabel(event: TriggerEvent): {
  text: string;
  level: 'ok' | 'soon' | 'expired';
} | null {
  const raw = event.expiresAt;
  if (!raw) return null;

  const expires = new Date(raw);
  if (isNaN(expires.getTime())) return null;

  const now = Date.now();
  const diffDays = Math.ceil((expires.getTime() - now) / 86_400_000);

  if (diffDays < 0)  return { text: 'истёк',              level: 'expired' };
  if (diffDays <= 14) return { text: `ещё ${diffDays} д`, level: 'soon' };
  return {
    text: expires.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
    level: 'ok',
  };
}

// ── Core lifecycle function ───────────────────────────────────────────────────

/**
 * Scan the full event list and archive any expired events in-place.
 *
 * Backward compat rules applied here:
 *  - Event without expiresAt → compute from event.date (or now as fallback)
 *  - Event without status    → treated as active, eligible for archiving
 *
 * Returns a new array (immutable) + count of newly archived events.
 */
export function archiveExpiredEvents(events: TriggerEvent[]): {
  updated: TriggerEvent[];
  archivedCount: number;
} {
  const now = new Date();
  let archivedCount = 0;

  const updated = events.map((event): TriggerEvent => {
    // Already archived — nothing to do
    if (event.status === 'archived') return event;

    // Resolve expiresAt (compute if missing — backward compat)
    const expiresAt =
      event.expiresAt ?? calcExpiresAt(event.category, event.date ?? new Date().toISOString());

    const expired = new Date(expiresAt) < now;

    if (expired) {
      archivedCount++;
      return { ...event, status: 'archived', expiresAt };
    }

    // Patch expiresAt if it was missing but event is still active
    if (!event.expiresAt) {
      return { ...event, status: 'active', expiresAt };
    }

    return event;
  });

  return { updated, archivedCount };
}
