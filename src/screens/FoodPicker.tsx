'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FOODS } from '@/data/foods';
import { SECTION_ORDER } from '@/engine/weeklyList';
import { type FoodPref, prefOf, setPref } from '@/lib/settings';
import { useAppState } from '@/state/AppState';
import { GroupedList } from '@/ui/GroupedList';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';

export type PickerFilter = 'all' | 'include' | 'liked' | 'disliked';

const PREFS: { value: FoodPref; label: string }[] = [
  { value: 'include', label: 'Always' },
  { value: 'liked', label: 'Like' },
  { value: 'neutral', label: '–' },
  { value: 'disliked', label: "Don't like" },
];

const TITLES: Record<PickerFilter, string> = { all: 'All foods', include: 'Your foods', liked: 'Foods you like', disliked: "Foods you don't like" };

export function FoodPicker({ open, onClose, initialFilter }: { open: boolean; onClose(): void; initialFilter: PickerFilter }) {
  const { settings, setSettings } = useAppState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PickerFilter>(initialFilter);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = FOODS.filter((f) => {
      if (q && !f.name.toLowerCase().includes(q)) return false;
      const pref = prefOf(settings, f.id);
      if (filter === 'include') return pref === 'include';
      if (filter === 'liked') return pref === 'liked' || pref === 'include';
      if (filter === 'disliked') return pref === 'disliked';
      return true;
    });
    return SECTION_ORDER.map((s) => ({ section: s, foods: shown.filter((f) => f.section === s).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((g) => g.foods.length);
  }, [query, filter, settings]);

  return (
    <Sheet open={open} onClose={onClose} title={TITLES[filter]}>
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-[10px] bg-fill px-2">
        <Search aria-hidden className="size-4 text-secondary" />
        <input type="search" aria-label="Search foods" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)}
          className="min-h-9 flex-1 bg-transparent text-body outline-none placeholder:text-secondary" />
      </div>
      <div className="mx-4 mb-4">
        <Segmented<PickerFilter> label="Show" value={filter} onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, { value: 'include', label: 'Yours' }, { value: 'liked', label: 'Like' }, { value: 'disliked', label: "Don't" }]} />
      </div>
      {groups.length === 0 && <p className="px-8 py-10 text-center text-body text-secondary">
        {query ? 'No foods match that search.' : filter === 'all' ? 'No foods.' : 'Nothing here yet. Pick foods from All.'}
      </p>}
      {groups.map((g) => (
        <GroupedList key={g.section} header={g.section}>
          {g.foods.map((f) => (
            <div key={f.id} className="px-4 py-2.5">
              <div className="pb-1.5 text-body">{f.name}</div>
              <Segmented label={f.name} value={prefOf(settings, f.id)} options={PREFS}
                onChange={(pref) => setSettings(setPref(settings, f.id, pref))} />
            </div>
          ))}
        </GroupedList>
      ))}
    </Sheet>
  );
}
