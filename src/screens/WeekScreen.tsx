'use client';

import { Lock, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { WeekPlan } from '@/engine/planWeek';
import type { ListRow, WeeklyList } from '@/engine/weeklyList';
import { useAppState } from '@/state/AppState';
import { GroupedList } from '@/ui/GroupedList';
import { NavHeader } from '@/ui/NavHeader';
import { NutrientReportSheet } from './NutrientReportSheet';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function WeekScreen() {
  const { ready, plan, list, status, error, generate } = useAppState();
  const [report, setReport] = useState(false);
  const solving = status === 'solving';

  const addFood = async (foodId: string, addGrams: number) => {
    if (!plan) return;
    const current = plan.items.find((i) => i.foodId === foodId)?.grams ?? 0;
    await generate({ locks: { ...plan.input.locks, [foodId]: current + addGrams } });
  };

  const regenerate = (
    <button type="button" onClick={() => generate()} disabled={solving} aria-label="Make a new plan"
      className="flex size-11 items-center justify-center text-tint disabled:opacity-40">
      <RefreshCw className={`size-5 ${solving ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    </button>
  );

  if (!ready) return <NavHeader title="This Week" />;

  return (
    <>
      <NavHeader title="This Week" trailing={plan ? regenerate : undefined} />
      {error && (
        <p role="alert" className="mx-4 mb-4 rounded-[10px] bg-cell px-4 py-3 text-subhead text-red">
          {error}{plan ? ' Your last plan is still shown.' : ''}
        </p>
      )}
      {!plan || !list ? (
        <EmptyState solving={solving} onGenerate={() => generate()} />
      ) : (
        <>
          <Summary plan={plan} list={list} onReport={() => setReport(true)} />
          {list.sections.map((s) => (
            <GroupedList key={s.title} header={s.title}>
              {s.rows.map((r) => <ItemRow key={r.foodId} row={r} />)}
            </GroupedList>
          ))}
          <DailyAverage list={list} />
          <GroupedList header="Notes">
            {list.notes.map((n) => <p key={n} className="px-4 py-2.5 text-subhead">{n}</p>)}
          </GroupedList>
          <NutrientReportSheet open={report} onClose={() => setReport(false)} plan={plan} list={list} busy={solving}
            onAddFood={(id, g) => { setReport(false); void addFood(id, g); }} />
        </>
      )}
    </>
  );
}

function EmptyState({ solving, onGenerate }: { solving: boolean; onGenerate(): void }) {
  return (
    <div className="mx-4 rounded-[10px] bg-cell px-5 py-8 text-center">
      <p className="text-title2 font-semibold">Plan your week</p>
      <p className="mx-auto mt-2 max-w-72 text-subhead text-secondary">
        Set up your <Link href="/profile" className="text-tint">profile and foods</Link>, then make a shopping list that covers your nutrients.
      </p>
      <button type="button" onClick={onGenerate} disabled={solving}
        className="mt-6 min-h-[50px] w-full rounded-[12px] bg-tint text-headline font-semibold text-white disabled:opacity-60">
        {solving ? 'Planning your week…' : 'Make my list'}
      </button>
    </div>
  );
}

/** The one bold element: a ring showing how much of the week's nutrition is covered. */
function CoverageRing({ ok, total }: { ok: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const frac = total ? ok / total : 0;
  return (
    <svg viewBox="0 0 80 80" className="size-[88px] shrink-0" role="img" aria-label={`${ok} of ${total} nutrients on target`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--fill)" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--green)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 40 40)" />
      <text x="40" y="39" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--label)">{ok}</text>
      <text x="40" y="54" textAnchor="middle" fontSize="10" fill="var(--secondary)">of {total}</text>
    </svg>
  );
}

function Summary({ plan, list, onReport }: { plan: WeekPlan; list: WeeklyList; onReport(): void }) {
  const ok = list.coverage.filter((c) => c.status === 'ok').length;
  const kcalTarget = plan.input.targets.dailyCalories;
  const proteinGoal = (plan.input.targets.nutrients.protein.target ?? 0) / 7;
  const off = list.coverage.filter((c) => c.status !== 'ok').map((c) => c.name);
  return (
    <section className="mx-4 mb-8 overflow-hidden rounded-[10px] bg-cell">
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        <CoverageRing ok={ok} total={list.coverage.length} />
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-subhead">
          <dt className="text-secondary">Calories</dt>
          <dd className="text-right tabular-nums">{fmt(list.dailyAverage.kcal)} <span className="text-secondary">/ {fmt(kcalTarget)} a day</span></dd>
          <dt className="text-secondary">Week</dt>
          <dd className="text-right tabular-nums">{fmt(list.weeklyKcal)} kcal</dd>
          <dt className="text-secondary">Protein</dt>
          <dd className="text-right tabular-nums">{list.dailyAverage.protein} <span className="text-secondary">/ {Math.round(proteinGoal)} g a day</span></dd>
        </dl>
      </div>
      <p className="px-4 pb-3 text-footnote text-secondary">
        {off.length ? `Nutrients on target for the week. Needs attention: ${off.join(', ')}.` : 'Every tracked nutrient is on target for the week.'}
      </p>
      <button type="button" onClick={onReport} className="min-h-11 w-full border-t border-separator/70 text-body text-tint active:bg-cell-pressed">
        Nutrient report
      </button>
    </section>
  );
}

function ItemRow({ row }: { row: ListRow }) {
  return (
    <div className="flex min-h-11 items-start gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-body">
          {row.name}
          {row.locked && <Lock aria-label="Fixed amount" className="size-3.5 text-secondary" />}
        </span>
        <span className="block text-footnote text-secondary">{row.gramsText}</span>
        {row.dailyHint && <span className="block text-footnote text-secondary">{row.dailyHint}</span>}
      </span>
      <span className="max-w-[45%] pt-0.5 text-right text-subhead text-secondary">{row.itemsText}</span>
    </div>
  );
}

function DailyAverage({ list }: { list: WeeklyList }) {
  const d = list.dailyAverage;
  const cells: [string, string][] = [['kcal', fmt(d.kcal)], ['protein', `${d.protein} g`], ['carbs', `${d.carbs} g`], ['fat', `${d.fat} g`], ['fiber', `${d.fiber} g`]];
  return (
    <GroupedList header="Daily average">
      <div className="grid grid-cols-5 px-2 py-3 text-center">
        {cells.map(([k, v]) => (
          <div key={k}>
            <div className="text-subhead font-semibold tabular-nums">{v}</div>
            <div className="text-caption text-secondary">{k}</div>
          </div>
        ))}
      </div>
    </GroupedList>
  );
}
