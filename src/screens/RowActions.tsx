'use client';

import { useMemo, useState } from 'react';
import { getFood } from '@/data/foods';
import { NUTRIENTS } from '@/data/nutrients';
import type { WeekPlan } from '@/engine/planWeek';
import type { NutrientId } from '@/engine/types';
import { gramsText } from '@/engine/weeklyList';
import { withLockedAmount } from '@/lib/edits';
import { prefOf } from '@/lib/settings';
import { useAppState } from '@/state/AppState';
import { GroupedList, Row } from '@/ui/GroupedList';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';

export function RowActions({
  plan, foodId, busy, onClose, onDislike, onRemoveFromYours, onUseAmount, onRebalance,
}: {
  plan: WeekPlan;
  foodId: string;
  busy: boolean;
  onClose(): void;
  onDislike(): void;
  onRemoveFromYours(): void;
  onUseAmount(p: WeekPlan): void;
  onRebalance(grams: number): void;
}) {
  const { settings } = useAppState();
  const food = getFood(foodId);
  const item = plan.items.find((i) => i.foodId === foodId);
  const step = food.roundTo === 'unit' ? food.unit.grams : food.roundTo;
  const [grams, setGrams] = useState(item?.grams ?? step);
  const preview = useMemo(() => withLockedAmount(plan, foodId, grams), [plan, foodId, grams]);
  const changed = (Object.keys(preview.report.lines) as NutrientId[]).filter(
    (id) => id !== 'energy' && preview.report.lines[id].status !== plan.report.lines[id].status,
  );
  const kcalNow = Math.round(plan.report.lines.energy.total / 7);
  const kcalNew = Math.round(preview.report.lines.energy.total / 7);
  const isYours = prefOf(settings, foodId) === 'include';

  return (
    <Sheet open onClose={onClose} title={food.name}>
      <GroupedList header="Amount this trip" footer={
        grams === item?.grams ? 'Change the amount to see what it does to your nutrients.'
          : `${kcalNow.toLocaleString('en-US')} → ${kcalNew.toLocaleString('en-US')} kcal a day. ${
            changed.length ? changed.map((id) => `${NUTRIENTS[id].name} becomes ${preview.report.lines[id].status === 'ok' ? 'on target' : preview.report.lines[id].status}`).join('; ') + '.' : 'No nutrient changes status.'}`
      }>
        <Row title={gramsText(food, grams)} accessory={
          <Stepper label={`${food.name} amount`} value={grams} min={step} max={Math.max(food.maxWeeklyGrams, grams)} step={step}
            format={() => ''} onChange={setGrams} />} />
        <Row title={<span className="text-tint">Use this amount</span>} onClick={() => onUseAmount(preview)} />
        <Row title={<span className={busy ? 'text-tertiary' : 'text-tint'}>Fix this amount and rebalance the rest</span>}
          onClick={busy ? undefined : () => onRebalance(grams)} />
      </GroupedList>
      <GroupedList footer={isYours ? 'Removing it from your foods lets the app leave it out when it isn’t needed.' : undefined}>
        {isYours && <Row title={<span className={busy ? 'text-tertiary' : 'text-tint'}>Remove from your foods</span>} onClick={busy ? undefined : onRemoveFromYours} />}
        <Row title={<span className={busy ? 'text-tertiary' : 'text-red'}>I don’t like this</span>} subtitle="Swaps it out and shows you the new plan first."
          onClick={busy ? undefined : onDislike} />
      </GroupedList>
    </Sheet>
  );
}
