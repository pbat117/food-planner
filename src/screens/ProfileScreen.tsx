'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FOODS, getFood } from '@/data/foods';
import { NUTRIENTS } from '@/data/nutrients';
import { SUPPLEMENTABLE, supplementTiming } from '@/data/supplements';
import { dailyCaloriesFor } from '@/engine/targets';
import type { Activity, NutrientId, Profile } from '@/engine/types';
import type { Settings } from '@/lib/settings';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, proteinGoalInMode } from '@/lib/units';
import { useAppState } from '@/state/AppState';
import { NumberField, SelectField, TextField } from '@/ui/Fields';
import { GroupedList, Row } from '@/ui/GroupedList';
import { NavHeader } from '@/ui/NavHeader';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { Switch } from '@/ui/Switch';
import { FoodPicker, type PickerFilter } from './FoodPicker';

const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'veryActive', label: 'Very active' },
];

export function ProfileScreen() {
  const router = useRouter();
  const { settings, setSettings, ready } = useAppState();
  const [picker, setPicker] = useState<PickerFilter | null>(null);
  const [addSupp, setAddSupp] = useState(false);
  const [addRegular, setAddRegular] = useState(false);
  const p = settings.profile;
  const imperial = settings.unitSystem === 'imperial';
  const setProfile = (patch: Partial<Profile>) => setSettings({ ...settings, profile: { ...p, ...patch } });
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  let kcal: string;
  try {
    kcal = `About ${dailyCaloriesFor(p).toLocaleString('en-US')} kcal a day to ${p.goal === 'maintain' ? 'maintain your weight' : p.goal === 'lose' ? 'lose weight slowly' : 'gain weight slowly'}.`;
  } catch {
    kcal = '';
  }
  const { ft, inches } = cmToFtIn(p.heightCm);
  const protein = p.proteinGoal ?? { mode: 'gPerKg' as const, value: 1.6 };

  if (!ready) return <NavHeader title="Profile" />;

  return (
    <>
      <NavHeader title="Profile" />

      <GroupedList header="Body" footer="Used to work out your calorie and nutrient targets.">
        <Row title="Units" accessory={
          <span className="block w-40"><Segmented label="Units" value={settings.unitSystem}
            options={[{ value: 'imperial', label: 'ft, lb' }, { value: 'metric', label: 'cm, kg' }]}
            onChange={(v) => set({ unitSystem: v })} /></span>} />
        <Row title="Age" accessory={<Stepper label="Age" value={p.age} min={19} max={100} step={1} onChange={(age) => setProfile({ age })} />} />
        <Row title="Sex" accessory={
          <span className="block w-40"><Segmented label="Sex" value={p.sex}
            options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
            onChange={(sex) => setProfile({ sex })} /></span>} />
        <Row title="Height" accessory={imperial ? (
          <span className="inline-flex gap-2">
            <NumberField label="Height, feet" value={ft} min={3} max={7} suffix="ft" width="w-8"
              onChange={(v) => setProfile({ heightCm: ftInToCm(v, inches) })} />
            <NumberField label="Height, inches" value={inches} min={0} max={11.5} suffix="in" width="w-10"
              onChange={(v) => setProfile({ heightCm: ftInToCm(ft, v) })} />
          </span>
        ) : (
          <NumberField label="Height" value={p.heightCm} min={120} max={230} suffix="cm" onChange={(heightCm) => setProfile({ heightCm })} />
        )} />
        <Row title="Weight" accessory={imperial ? (
          <NumberField label="Weight" value={kgToLb(p.weightKg)} min={66} max={660} suffix="lb" onChange={(v) => setProfile({ weightKg: lbToKg(v) })} />
        ) : (
          <NumberField label="Weight" value={p.weightKg} min={30} max={300} suffix="kg" onChange={(weightKg) => setProfile({ weightKg })} />
        )} />
      </GroupedList>

      <GroupedList header="Goal" footer={<>Activity: light is 1–3 workouts a week, moderate 3–5, active 6–7, very active is hard daily training. {kcal}</>}>
        <Row title="Activity" accessory={<SelectField label="Activity" value={p.activity} options={ACTIVITIES} onChange={(activity) => setProfile({ activity })} />} />
        <Row title="Goal" accessory={
          <span className="block w-52"><Segmented label="Goal" value={p.goal}
            options={[{ value: 'lose', label: 'Lose' }, { value: 'maintain', label: 'Maintain' }, { value: 'gain', label: 'Gain' }]}
            onChange={(goal) => setProfile({ goal })} /></span>} />
        <Row title="Protein" subtitle={protein.mode === 'gPerKg' ? `${Math.round(protein.value * p.weightKg)} g a day` : undefined} accessory={
          <span className="inline-flex items-center gap-2">
            <NumberField label="Protein goal" value={protein.value} min={protein.mode === 'gPerDay' ? 20 : 0.5} max={protein.mode === 'gPerDay' ? 400 : 3.5}
              width="w-14" onChange={(value) => setProfile({ proteinGoal: { mode: protein.mode, value } })} />
            <span className="block w-32"><Segmented label="Protein unit" value={protein.mode}
              options={[{ value: 'gPerDay', label: 'g/day' }, { value: 'gPerKg', label: 'g/kg' }]}
              onChange={(mode) => setProfile({ proteinGoal: proteinGoalInMode(protein, mode, p.weightKg) })} /></span>
          </span>} />
      </GroupedList>

      <GroupedList header="Foods" footer="Your foods are always on the list; the app sizes them. It picks staples only from foods you like (or from everything, if you haven't picked any).">
        <Row title="Your foods" detail={settings.includeFoodIds.length} chevron onClick={() => setPicker('include')} />
        <Row title="Foods you like" detail={settings.likedFoodIds.length} chevron onClick={() => setPicker('liked')} />
        <Row title="Foods you don't like" detail={settings.dislikedFoodIds.length} chevron onClick={() => setPicker('disliked')} />
        <Row title="Browse all foods" chevron onClick={() => setPicker('all')} />
      </GroupedList>

      <GroupedList header="Fruit" footer="Keeps fruit on the list every day, from only a few kinds.">
        <Row title="Include fruit" accessory={<Switch label="Include fruit" checked={settings.fruit !== null}
          onChange={(on) => set({ fruit: on ? { gramsPerDay: 300, maxKinds: 5 } : null })} />} />
        {settings.fruit && (
          <>
            <Row title="Per day" accessory={<Stepper label="Fruit per day" value={settings.fruit.gramsPerDay} min={100} max={800} step={50}
              format={(v) => `${v} g`} onChange={(gramsPerDay) => set({ fruit: { ...settings.fruit!, gramsPerDay } })} />} />
            <Row title="Kinds" accessory={<Stepper label="Kinds of fruit" value={settings.fruit.maxKinds} min={1} max={8} step={1}
              onChange={(maxKinds) => set({ fruit: { ...settings.fruit!, maxKinds } })} />} />
          </>
        )}
      </GroupedList>

      <GroupedList header="Supplements" footer="Nutrients you supplement are left to the supplement, so the plan won't push extra food for them.">
        {settings.supplements.map((s, i) => (
          <Row key={`${s.nutrient}-${i}`} title={s.label}
            subtitle={`${s.dailyDose.toLocaleString('en-US')} ${NUTRIENTS[s.nutrient].unit} a day · ${supplementTiming(s.nutrient) ?? ''}`}
            accessory={<button type="button" aria-label={`Remove ${s.label}`} className="flex size-11 items-center justify-center text-red"
              onClick={() => set({ supplements: settings.supplements.filter((_, j) => j !== i) })}><Trash2 className="size-5" /></button>} />
        ))}
        <Row title={<span className="inline-flex items-center gap-2 text-tint"><Plus className="size-5" />Add a supplement</span>} onClick={() => setAddSupp(true)} />
      </GroupedList>

      <GroupedList header="Regular items" footer="Things you always have each week. Single foods are entered per week; recipes, like your protein shake, are added on the Recipes tab with how often you have them.">
        {Object.entries(settings.regularItems).map(([id, g]) => (
          <Row key={id} title={getFood(id).name} detail={`${g.toLocaleString('en-US')} g a week`}
            accessory={<button type="button" aria-label={`Remove ${getFood(id).name}`} className="flex size-11 items-center justify-center text-red"
              onClick={() => { const r = { ...settings.regularItems }; delete r[id]; set({ regularItems: r }); }}><Trash2 className="size-5" /></button>} />
        ))}
        {settings.regularRecipes.map((rr) => {
          const r = settings.recipes.find((x) => x.id === rr.recipeId);
          return r ? (
            <Row key={rr.recipeId} title={r.name} subtitle={`Recipe · ${rr.timesPerWeek}× a week`}
              accessory={<button type="button" aria-label={`Remove ${r.name}`} className="flex size-11 items-center justify-center text-red"
                onClick={() => set({ regularRecipes: settings.regularRecipes.filter((x) => x.recipeId !== rr.recipeId) })}><Trash2 className="size-5" /></button>} />
          ) : null;
        })}
        <Row title={<span className="inline-flex items-center gap-2 text-tint"><Plus className="size-5" />Add a regular item</span>} onClick={() => setAddRegular(true)} />
        <Row title={<span className="inline-flex items-center gap-2 text-tint"><Plus className="size-5" />Add a regular recipe</span>} onClick={() => router.push('/recipes')} />
      </GroupedList>

      <GroupedList header="Shopping" footer="Each trip buys food for the days until your next trip. Fewer foods per trip means a simpler shop; your foods rotate through the trips.">
        <Row title="Shop every" accessory={<Stepper label="Days between trips" value={settings.shopEveryDays} min={1} max={7} step={1}
          format={(d) => (d === 1 ? '1 day' : `${d} days`)} onChange={(shopEveryDays) => set({ shopEveryDays })} />} />
        <Row title="Next trip" accessory={<input type="date" aria-label="Next trip date" value={settings.nextTripDate}
          onChange={(e) => set({ nextTripDate: e.target.value })}
          className="min-h-11 bg-transparent text-right text-body text-tint outline-none" />} />
        <Row title="Foods per trip" accessory={<Stepper label="Foods per trip" value={settings.maxDistinctFoods} min={6} max={20} step={1}
          onChange={(maxDistinctFoods) => set({ maxDistinctFoods })} />} />
      </GroupedList>

      {picker && <FoodPicker key={picker} open initialFilter={picker} onClose={() => setPicker(null)} />}
      <AddSupplementSheet open={addSupp} onClose={() => setAddSupp(false)} />
      <AddRegularSheet open={addRegular} onClose={() => setAddRegular(false)} />
    </>
  );
}

function AddSupplementSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { settings, setSettings } = useAppState();
  const [nutrient, setNutrient] = useState<NutrientId>('vitD');
  const preset = SUPPLEMENTABLE.find((s) => s.id === nutrient)!;
  const [dose, setDose] = useState(preset.typicalDose);
  const [label, setLabel] = useState(preset.label);
  const pick = (id: NutrientId) => {
    const s = SUPPLEMENTABLE.find((x) => x.id === id)!;
    setNutrient(id);
    setDose(s.typicalDose);
    setLabel(s.label);
  };
  const add = () => {
    setSettings({ ...settings, supplements: [...settings.supplements, { nutrient, dailyDose: dose, label: label.trim() || preset.label }] });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add supplement"
      action={<button type="button" onClick={add} className="min-h-11 text-body font-semibold text-tint">Add</button>}>
      <GroupedList footer={preset.timing}>
        <Row title="Nutrient" accessory={<SelectField label="Nutrient" value={nutrient}
          options={SUPPLEMENTABLE.map((s) => ({ value: s.id, label: NUTRIENTS[s.id].name }))} onChange={pick} />} />
        <Row title="Daily dose" accessory={<NumberField label="Daily dose" value={dose} min={0.1} max={100000}
          suffix={NUTRIENTS[nutrient].unit} onChange={setDose} />} />
        <Row title={<TextField label="Name on the list" value={label} onChange={setLabel} placeholder="Name on the list" />} />
      </GroupedList>
    </Sheet>
  );
}

function AddRegularSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { settings, setSettings } = useAppState();
  const options = [...FOODS].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ value: f.id, label: f.name }));
  const [foodId, setFoodId] = useState('milk');
  const [grams, setGrams] = useState(1400);
  const add = () => {
    setSettings({ ...settings, regularItems: { ...settings.regularItems, [foodId]: grams } });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add regular item"
      action={<button type="button" onClick={add} className="min-h-11 text-body font-semibold text-tint">Add</button>}>
      <GroupedList footer="Enter the amount for the whole week, e.g. 200 g a day is 1,400 g.">
        <Row title="Food" accessory={<SelectField label="Food" value={foodId} options={options} onChange={setFoodId} />} />
        <Row title="Per week" accessory={<NumberField label="Grams per week" value={grams} min={1} max={20000} suffix="g" onChange={setGrams} />} />
      </GroupedList>
    </Sheet>
  );
}
