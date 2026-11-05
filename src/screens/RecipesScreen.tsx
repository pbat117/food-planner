'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { FOODS, getFood } from '@/data/foods';
import { deleteRecipe, type Recipe } from '@/lib/settings';
import { useAppState } from '@/state/AppState';
import { NumberField, SelectField, TextField } from '@/ui/Fields';
import { GroupedList, Row } from '@/ui/GroupedList';
import { NavHeader } from '@/ui/NavHeader';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { Switch } from '@/ui/Switch';

const FOOD_OPTIONS = [...FOODS].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ value: f.id, label: f.name }));

const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function RecipesScreen() {
  const { ready, settings } = useAppState();
  const [editing, setEditing] = useState<Recipe | null>(null);
  const add = (
    <button type="button" aria-label="Add a recipe" onClick={() => setEditing({ id: newId(), name: '', ingredients: [{ foodId: 'milk', grams: 250 }] })}
      className="flex size-11 items-center justify-center text-tint">
      <Plus className="size-6" />
    </button>
  );
  if (!ready) return <NavHeader title="Recipes" />;
  return (
    <>
      <NavHeader title="Recipes" trailing={add} />
      {settings.recipes.length === 0 ? (
        <div className="mx-4 rounded-[10px] bg-cell px-5 py-8 text-center">
          <p className="text-title2 font-semibold">No recipes yet</p>
          <p className="mx-auto mt-2 max-w-72 text-subhead text-secondary">
            Add something you make often, like a protein shake. Mark it as a regular item and every trip buys enough for it.
          </p>
          <button type="button" onClick={() => setEditing({ id: newId(), name: '', ingredients: [{ foodId: 'milk', grams: 250 }] })}
            className="mt-6 min-h-[50px] w-full rounded-[12px] bg-tint text-headline font-semibold text-white">
            Add a recipe
          </button>
        </div>
      ) : (
        <GroupedList header="Your recipes">
          {settings.recipes.map((r) => {
            const reg = settings.regularRecipes.find((x) => x.recipeId === r.id);
            return (
              <Row key={r.id} title={r.name || 'Untitled'} chevron onClick={() => setEditing(r)}
                subtitle={`${r.ingredients.map((i) => getFood(i.foodId).name).join(', ')}${reg ? ` · regular, ${reg.timesPerWeek}× a week` : ''}`} />
            );
          })}
        </GroupedList>
      )}
      {editing && <RecipeSheet key={editing.id} recipe={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecipeSheet({ recipe, onClose }: { recipe: Recipe; onClose(): void }) {
  const { settings, setSettings } = useAppState();
  const existing = settings.recipes.some((r) => r.id === recipe.id);
  const reg = settings.regularRecipes.find((x) => x.recipeId === recipe.id);
  const [name, setName] = useState(recipe.name);
  const [ingredients, setIngredients] = useState(recipe.ingredients);
  const [regular, setRegular] = useState(!!reg);
  const [times, setTimes] = useState(reg?.timesPerWeek ?? 7);

  const valid = name.trim() !== '' && ingredients.length > 0;
  const save = () => {
    if (!valid) return;
    const r: Recipe = { id: recipe.id, name: name.trim(), ingredients };
    const recipes = existing ? settings.recipes.map((x) => (x.id === r.id ? r : x)) : [...settings.recipes, r];
    const others = settings.regularRecipes.filter((x) => x.recipeId !== r.id);
    setSettings({ ...settings, recipes, regularRecipes: regular ? [...others, { recipeId: r.id, timesPerWeek: times }] : others });
    onClose();
  };
  const remove = () => {
    setSettings(deleteRecipe(settings, recipe.id));
    onClose();
  };
  const setIng = (i: number, patch: Partial<Recipe['ingredients'][number]>) =>
    setIngredients(ingredients.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <Sheet open onClose={onClose} title={existing ? 'Edit recipe' : 'New recipe'}
      action={<button type="button" onClick={save} disabled={!valid} className="min-h-11 text-body font-semibold text-tint disabled:opacity-40">Save</button>}>
      <GroupedList>
        <div className="px-4"><TextField label="Recipe name" value={name} onChange={setName} placeholder="Name, e.g. Protein shake" /></div>
      </GroupedList>
      <GroupedList header="Ingredients" footer="Amounts for one serving.">
        {ingredients.map((g, i) => (
          <div key={i} className="flex min-h-11 items-center gap-2 px-4">
            <span className="min-w-0 flex-1">
              <SelectField label={`Ingredient ${i + 1}`} value={g.foodId} options={FOOD_OPTIONS} onChange={(foodId) => setIng(i, { foodId })} />
            </span>
            <NumberField label={`Grams of ${getFood(g.foodId).name}`} value={g.grams} min={1} max={5000} suffix="g" onChange={(grams) => setIng(i, { grams })} />
            <button type="button" aria-label={`Remove ${getFood(g.foodId).name}`} onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}
              className="flex size-11 items-center justify-center text-red">
              <Trash2 className="size-5" />
            </button>
          </div>
        ))}
        <Row title={<span className="inline-flex items-center gap-2 text-tint"><Plus className="size-5" />Add an ingredient</span>}
          onClick={() => setIngredients([...ingredients, { foodId: 'oats', grams: 50 }])} />
      </GroupedList>
      <GroupedList footer="A regular item is bought on every trip, as many servings as the trip needs.">
        <Row title="Regular item" accessory={<Switch label="Regular item" checked={regular} onChange={setRegular} />} />
        {regular && (
          <Row title="Times a week" accessory={<Stepper label="Times a week" value={times} min={1} max={14} step={1} format={(v) => `${v}×`} onChange={setTimes} />} />
        )}
      </GroupedList>
      {existing && (
        <GroupedList>
          <button type="button" onClick={remove} className="min-h-11 w-full text-body text-red active:bg-cell-pressed">Delete recipe</button>
        </GroupedList>
      )}
    </Sheet>
  );
}
