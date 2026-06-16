import { normalizeCategoryKey } from "./state.js";

export function getActiveCutoff(appState) {
  if (!appState.cutoffs.length) return null;
  return (
    appState.cutoffs.find((c) => c.id === appState.selectedCutoffId) ??
    appState.cutoffs[0]
  );
}

export function getCutoffTotals(appState, cutoffId) {
  return appState.transactions
    .filter((t) => t.cutoffId === cutoffId)
    .reduce(
      (acc, t) => {
        if (t.type === "income") acc.income += t.amount;
        else acc.expenses += t.amount;
        return acc;
      },
      { income: 0, expenses: 0 },
    );
}

export function getLatestCutoff(appState) {
  return (
    appState.cutoffs
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

export function getCategoryTransactions(appState, cutoffId, category) {
  const bucket = normalizeCategoryKey(category);
  const targetId = cutoffId ?? getLatestCutoff(appState)?.id ?? null;
  if (!targetId) return [];

  return appState.transactions
    .filter((t) => t.cutoffId === targetId)
    .filter((t) => {
      if (bucket === "INCOME") return t.type === "income";
      return t.type === "expense" && normalizeCategoryKey(t.category) === bucket;
    })
    .sort((a, b) => {
      if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
      return b.date.localeCompare(a.date);
    });
}

export function getCategoryTotal(appState, cutoffId, category) {
  return getCategoryTransactions(appState, cutoffId, category).reduce(
    (sum, t) => sum + t.amount,
    0,
  );
}

export function getFilteredTransactions(appState, filterValue) {
  const sorted = [...appState.transactions].sort((a, b) => {
    if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
    return b.date.localeCompare(a.date);
  });
  if (filterValue === "all") return sorted;
  return sorted.filter((t) => t.cutoffId === filterValue);
}
