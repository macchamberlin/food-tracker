import { isWithinWindow } from './fasting.js';

export function calorieScore(actual, target) {
  if (!target) return 100;
  const diffPct = Math.abs(actual - target) / target * 100;
  return Math.max(0, 100 - Math.min(100, diffPct));
}

export function proteinScore(actual, target) {
  if (!target) return 100;
  return Math.min(100, (actual / target) * 100);
}

export function fastingScore(entries, windowStart, windowEnd) {
  if (entries.length === 0) return 100; // neutral — nothing logged yet to penalize
  const inWindowCount = entries.filter((e) =>
    isWithinWindow(new Date(e.timestamp), windowStart, windowEnd)
  ).length;
  return (inWindowCount / entries.length) * 100;
}

export function dailyTotals(entries) {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (Number(e.calories) || 0),
      protein_g: acc.protein_g + (Number(e.protein_g) || 0),
      carbs_g: acc.carbs_g + (Number(e.carbs_g) || 0),
      fat_g: acc.fat_g + (Number(e.fat_g) || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

export function dailyScore(entries, settings) {
  const totals = dailyTotals(entries);
  const cal = calorieScore(totals.calories, settings.calorieTarget);
  const pro = proteinScore(totals.protein_g, settings.proteinTarget);
  const fast = fastingScore(entries, settings.windowStart, settings.windowEnd);
  const w = settings.weights || { calories: 0.4, protein: 0.3, fasting: 0.3 };
  const weightSum = w.calories + w.protein + w.fasting || 1;
  const score = (cal * w.calories + pro * w.protein + fast * w.fasting) / weightSum;
  return {
    score: Math.round(score),
    calorieScore: Math.round(cal),
    proteinScore: Math.round(pro),
    fastingScore: Math.round(fast),
    totals,
  };
}
