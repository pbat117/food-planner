import { addDays } from '@/engine/tripPlan';

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');

/** "Thu Nov 5 → Sun Nov 8 · 3 days": from this trip to the next one. */
export function tripRange(date: string, days: number): string {
  return `${fmtDay(date)} → ${fmtDay(addDays(date, days))} · ${days === 1 ? '1 day' : `${days} days`}`;
}

export const nextTripDay = (date: string, days: number) => fmtDay(addDays(date, days));
