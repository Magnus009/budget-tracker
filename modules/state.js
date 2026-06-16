export const STORAGE_KEY = "budget-tracker-state-v1";
export const DB_NAME = "budget-tracker-db-v1";
export const DB_STORE = "appState";
export const DEFAULT_CURRENCY = "PHP";
export const DASHBOARD_CATEGORIES = ["INCOME", "EXPENSES", "SAVINGS", "DEBTS", "BILLS"];

export const DEFAULT_STATE = {
  version: 1,
  settings: { currencyLabel: DEFAULT_CURRENCY },
  selectedCutoffId: null,
  cutoffs: [],
  transactions: [],
};

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export function parseAmount(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function safeText(value) {
  return String(value ?? "").trim();
}

export function normalizeCategoryKey(value) {
  return safeText(value).toUpperCase();
}

export function normalizeTransaction(item) {
  const type = item?.type === "income" ? "income" : "expense";
  const categoryKey = normalizeCategoryKey(item?.category);
  return {
    id: safeText(item?.id) || createId("txn"),
    cutoffId: safeText(item?.cutoffId),
    type,
    category: categoryKey || (type === "income" ? "INCOME" : "EXPENSES"),
    amount: Math.max(0, parseAmount(item?.amount)),
    note: safeText(item?.note),
    date: safeText(item?.date) || todayValue(),
    createdAt: safeText(item?.createdAt) || new Date().toISOString(),
  };
}

export function normalizeSubItem(item) {
  return {
    id: safeText(item?.id) || createId("sub"),
    description: safeText(item?.description) || "",
    amount: Math.max(0, parseAmount(item?.amount)),
    paid: item?.paid === true,
  };
}

export function normalizePlanItem(item) {
  const subItems = Array.isArray(item?.subItems) ? item.subItems.map(normalizeSubItem) : [];
  const derivedExpected = subItems.length > 0
    ? subItems.reduce((s, si) => s + si.amount, 0)
    : Math.max(0, parseAmount(item?.expected));
  const derivedActual = subItems.length > 0
    ? subItems.filter(si => si.paid).reduce((s, si) => s + si.amount, 0)
    : Math.max(0, parseAmount(item?.actual));
  return {
    id: safeText(item?.id) || createId("plan"),
    category: normalizeCategoryKey(item?.category) || "EXPENSES",
    description: safeText(item?.description) || "",
    expected: derivedExpected,
    actual: derivedActual,
    transactionId: safeText(item?.transactionId) || null,
    subItems,
  };
}

export function normalizeIncomeItem(item) {
  return {
    id: safeText(item?.id) || createId("inc"),
    transactionId: safeText(item?.transactionId),
    description: safeText(item?.description) || "Income",
    expected: Math.max(0, parseAmount(item?.expected)),
    actual: Math.max(0, parseAmount(item?.actual)),
  };
}

export function normalizeCutoff(item) {
  const rawItems = Array.isArray(item?.incomeItems) ? item.incomeItems : [];
  const incomeItems =
    rawItems.length > 0
      ? rawItems.map(normalizeIncomeItem)
      : item?.budget > 0
        ? [{ id: createId("inc"), description: "Income", expected: parseAmount(item.budget), actual: 0 }]
        : [];
  const budget = incomeItems.reduce((s, i) => s + (i.actual > 0 ? i.actual : i.expected), 0);
  const planItems = Array.isArray(item?.planItems)
    ? item.planItems.map(normalizePlanItem)
    : [];
  return {
    id: safeText(item?.id) || createId("cutoff"),
    name: safeText(item?.name) || "Untitled cutoff",
    startDate: safeText(item?.startDate) || todayValue(),
    endDate: safeText(item?.endDate) || todayValue(),
    budget,
    incomeItems,
    planItems,
    notes: safeText(item?.notes),
    locked: item?.locked === true,
    createdAt: safeText(item?.createdAt) || new Date().toISOString(),
  };
}

export function normalizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const cutoffs = Array.isArray(source.cutoffs) ? source.cutoffs.map(normalizeCutoff) : [];
  const transactions = Array.isArray(source.transactions)
    ? source.transactions.map(normalizeTransaction)
    : [];
  const selectedCutoffId =
    safeText(source.selectedCutoffId) && cutoffs.some((c) => c.id === source.selectedCutoffId)
      ? source.selectedCutoffId
      : cutoffs[0]?.id ?? null;

  return {
    version: 1,
    settings: {
      currencyLabel: safeText(source.settings?.currencyLabel) || DEFAULT_CURRENCY,
    },
    selectedCutoffId,
    cutoffs,
    transactions: transactions.filter((t) => cutoffs.some((c) => c.id === t.cutoffId)),
  };
}
