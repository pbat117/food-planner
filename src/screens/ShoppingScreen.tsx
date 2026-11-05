'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { getFood } from '@/data/foods';
import { AISLE_ORDER } from '@/engine/rounding';
import type { TripPlan } from '@/engine/tripPlan';
import { gramsText, itemsText } from '@/engine/weeklyList';
import { loadShopping, saveShopping, type ShoppingState } from '@/lib/shoppingState';
import { useAppState } from '@/state/AppState';
import { GroupedList } from '@/ui/GroupedList';
import { NavHeader } from '@/ui/NavHeader';
import { nextTripDay, tripRange } from './tripText';

const units = (foodId: string, grams: number) => Math.round((grams / getFood(foodId).unit.grams) * 2) / 2;

export function ShoppingScreen() {
  const { ready, trip } = useAppState();
  if (!ready) return <NavHeader title="Shopping" />;
  if (!trip) {
    return (
      <>
        <NavHeader title="Shopping" />
        <div className="mx-4 rounded-[10px] bg-cell px-5 py-8 text-center">
          <p className="text-title2 font-semibold">No trip planned</p>
          <p className="mx-auto mt-2 max-w-72 text-subhead text-secondary">
            Plan your trip on <Link href="/week" className="text-tint">This Trip</Link> first.
          </p>
        </div>
      </>
    );
  }
  return <TripList key={trip.date} trip={trip} />;
}

function TripList({ trip }: { trip: TripPlan }) {
  const { finishShopping, status } = useAppState();
  const [state, setState] = useState<ShoppingState>(() => loadShopping(trip.date));
  const update = (next: ShoppingState) => {
    setState(next);
    saveShopping(trip.date, next);
  };
  const toggle = (list: 'checked' | 'have', id: string) => {
    const cur = state[list];
    update({ ...state, [list]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const toBuy = Object.keys(trip.buy).filter((id) => !state.have.includes(id));
  const bought = toBuy.filter((id) => state.checked.includes(id)).length;
  const byAisle = AISLE_ORDER.map((aisle) => ({
    aisle,
    ids: toBuy.filter((id) => getFood(id).aisle === aisle).sort((a, b) => getFood(a).name.localeCompare(getFood(b).name)),
  })).filter((g) => g.ids.length);
  const pantryIds = Object.keys(trip.fromPantry).filter((id) => !(id in trip.buy));
  const fresh = toBuy.filter((id) => trip.days > getFood(id).shelfLifeDays);

  const done = () => {
    finishShopping([], state.have);
    update({ checked: [], have: [] });
  };

  return (
    <>
      <NavHeader title="Shopping" />
      <p className="px-4 pb-4 text-subhead text-secondary">
        {tripRange(trip.date, trip.days)} · {bought} of {toBuy.length} bought
      </p>
      {byAisle.map((g) => (
        <GroupedList key={g.aisle} header={g.aisle}>
          {g.ids.map((id) => {
            const f = getFood(id);
            const grams = trip.buy[id];
            const checked = state.checked.includes(id);
            return (
              <div key={id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                <button type="button" role="checkbox" aria-checked={checked} aria-label={`Bought ${f.name}`} onClick={() => toggle('checked', id)}
                  className={`flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-green bg-green text-white' : 'border-tertiary'}`}>
                  {checked && <Check className="size-4" strokeWidth={3} />}
                </button>
                <span className={`min-w-0 flex-1 ${checked ? 'text-secondary line-through' : ''}`}>
                  <span className="block text-body">{f.name}</span>
                  <span className="block text-footnote text-secondary">{gramsText(f, grams)} · {itemsText(f, grams, units(id, grams))}</span>
                </span>
                <button type="button" onClick={() => toggle('have', id)} className="min-h-11 shrink-0 text-subhead text-tint">I have this</button>
              </div>
            );
          })}
        </GroupedList>
      ))}
      {(state.have.length > 0 || pantryIds.length > 0) && (
        <GroupedList header="Already have" footer="Not bought this trip. Tap Buy if you run out.">
          {state.have.filter((id) => id in trip.buy).map((id) => (
            <div key={id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 text-body">{getFood(id).name}</span>
              <button type="button" onClick={() => toggle('have', id)} className="min-h-11 shrink-0 text-subhead text-tint">Buy</button>
            </div>
          ))}
          {pantryIds.map((id) => (
            <div key={id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-body">{getFood(id).name}</span>
                <span className="block text-footnote text-secondary">{gramsText(getFood(id), trip.fromPantry[id])} from your pantry</span>
              </span>
            </div>
          ))}
        </GroupedList>
      )}
      {fresh.length > 0 && (
        <GroupedList header="Freshness">
          {fresh.map((id) => (
            <p key={id} className="px-4 py-2.5 text-subhead">
              {getFood(id).name} keeps about {getFood(id).shelfLifeDays} days: eat it in the first part of the trip.
            </p>
          ))}
        </GroupedList>
      )}
      <div className="mx-4 mb-8">
        <button type="button" onClick={done} disabled={status === 'solving'}
          className="min-h-[50px] w-full rounded-[12px] bg-tint text-headline font-semibold text-white disabled:opacity-60">
          Done shopping
        </button>
        <p className="px-4 pt-1.5 text-footnote text-secondary">
          Saves what this trip covers and moves on to your next trip on {nextTripDay(trip.date, trip.days)}.
        </p>
      </div>
    </>
  );
}
