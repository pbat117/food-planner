import { beforeAll, describe, expect, it } from 'vitest';
import { getFood } from '@/data/foods';
import { planWeek, type WeekPlan } from '@/engine/planWeek';
import { buildWeeklyList, gramsText, itemsText } from '@/engine/weeklyList';
import { base } from '../fixtures';

const ORDER = ['Meat', 'Fruit', 'Vegetables and beans', 'Grains', 'Dairy', 'Nuts and nut butter', 'Other', 'Supplements and extras'];

describe('gramsText', () => {
  it('meat shows raw and cooked', () => {
    expect(gramsText(getFood('ground-beef-85'), 1350)).toBe('1,350 g raw (about 1,000 g cooked)');
  });
  it('rice shows dry and cooked', () => {
    expect(gramsText(getFood('white-rice'), 350)).toBe('350 g dry (about 1,000 g cooked)');
  });
  it('plain basis', () => {
    expect(gramsText(getFood('black-beans'), 800)).toBe('800 g drained');
    expect(gramsText(getFood('apple'), 600)).toBe('600 g');
  });
});

describe('itemsText', () => {
  it('countable fruit is the bare number', () => {
    expect(itemsText(getFood('kiwi'), 300, 4)).toBe('4');
    expect(itemsText(getFood('banana'), 118, 1)).toBe('1');
  });
  it('packs name the package size', () => {
    expect(itemsText(getFood('ground-beef-85'), 1350, 3)).toBe('About 3 packs of 454 g');
  });
  it('a food with a separate package shows units and the package', () => {
    const pb = getFood('peanut-butter');
    expect(itemsText(pb, 220, 14)).toBe('about 14 tbsp, under half a 500 g jar');
    expect(itemsText(pb, 400, 25)).toBe('about 25 tbsp, about 1 jar of 500 g');
    expect(itemsText(pb, 1100, 69)).toBe('about 69 tbsp, about 2 jars of 500 g');
  });
});

describe('buildWeeklyList', () => {
  let plan: WeekPlan;
  beforeAll(async () => {
    plan = await planWeek({
      ...base,
      supplements: [{ nutrient: 'vitD', dailyDose: 25, label: 'Vitamin D3 1,000 IU' }],
      supplementedNutrients: ['vitD'],
    });
  }, 30000);

  it('sections follow the sample order and skip empty ones', () => {
    const titles = buildWeeklyList(plan).sections.map((s) => s.title);
    expect(titles.length).toBeGreaterThan(2);
    const idx = titles.map((t) => ORDER.indexOf(t));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    buildWeeklyList(plan).sections.forEach((s) => expect(s.rows.length).toBeGreaterThan(0));
  });

  it('every food row has grams and items text', () => {
    for (const s of buildWeeklyList(plan).sections) for (const r of s.rows) {
      expect(r.gramsText, r.name).not.toBe('');
      expect(r.itemsText, r.name).not.toBe('');
    }
  });

  it('supplements are rows', () => {
    const { sections } = buildWeeklyList(plan);
    const last = sections[sections.length - 1];
    expect(last.title).toBe('Supplements and extras');
    expect(last.rows[0].name).toBe('Vitamin D3 1,000 IU');
    expect(last.rows[0].itemsText).toBe('7 daily doses, per label');
  });

  it('daily average is weekly / 7', () => {
    const l = buildWeeklyList(plan);
    expect(l.weeklyKcal).toBeCloseTo(plan.report.lines.energy.total, 0);
    expect(Math.abs(l.dailyAverage.kcal - plan.report.lines.energy.total / 7)).toBeLessThanOrEqual(1);
    expect(Math.abs(l.dailyAverage.protein - plan.report.lines.protein.total / 7)).toBeLessThanOrEqual(1);
  });

  it('coverage lists tracked nutrients; caps show percent of max', () => {
    const { coverage } = buildWeeklyList(plan);
    const ids = coverage.map((c) => c.nutrient);
    expect(ids).toContain('calcium');
    expect(ids).not.toContain('energy');
    const sodium = coverage.find((c) => c.nutrient === 'sodium')!;
    const line = plan.report.lines.sodium;
    expect(sodium.percent).toBeCloseTo((line.total / line.max!) * 100, 0);
    expect(coverage.find((c) => c.nutrient === 'vitD')!.supplemented).toBe(true);
  });

  it('notes include iodized salt and the estimates disclaimer', () => {
    const { notes } = buildWeeklyList(plan);
    expect(notes).toContain("Use iodized salt when you cook — iodine isn't tracked in the food data.");
    expect(notes).toContain('Package sizes vary, so the grams are the amounts to go by.');
  });

  it('adds a note per low nutrient with a suggestion', () => {
    const low = { ...plan, report: { ...plan.report, lines: { ...plan.report.lines,
      calcium: { ...plan.report.lines.calcium, total: plan.report.lines.calcium.target! * 0.5, status: 'low' as const } } } };
    const note = buildWeeklyList(low).notes.find((n) => n.startsWith('Calcium is at 50%'));
    expect(note).toMatch(/^Calcium is at 50% — .+, about \d+ g more$/);
  });
});
