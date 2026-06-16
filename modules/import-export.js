import { normalizeCutoff, normalizeTransaction, createId, safeText, todayValue } from "./state.js";

export function buildCutoffExportPackage(appState, cutoffId) {
  const cutoff = appState.cutoffs.find((c) => c.id === cutoffId);
  if (!cutoff) return null;
  return {
    version: 2,
    type: "cutoff-package",
    cutoff,
    transactions: appState.transactions.filter((t) => t.cutoffId === cutoffId),
    exportedAt: new Date().toISOString(),
  };
}

export async function exportCutoff(appState, cutoffId) {
  const payload = buildCutoffExportPackage(appState, cutoffId);
  if (!payload) return null;
  const { cutoff } = payload;
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `${cutoff.name || "cutoff"}-${cutoff.startDate || todayValue()}.json`,
  );
  return cutoff.name;
}

export async function exportAll(appState) {
  if (!appState.cutoffs.length) return false;
  const payload = {
    version: 2,
    type: "full-export",
    cutoffs: appState.cutoffs,
    transactions: appState.transactions,
    exportedAt: new Date().toISOString(),
  };
  triggerDownload(JSON.stringify(payload, null, 2), `budget-all-${todayValue()}.json`);
  return true;
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function importCutoffPackage(raw) {
  const payload = raw && typeof raw === "object" ? raw : null;
  const rawCutoff =
    payload?.cutoff ??
    (Array.isArray(payload?.cutoffs) ? payload.cutoffs[payload.cutoffs.length - 1] : null);
  if (!rawCutoff) {
    throw new Error("File does not contain a cutoff package.");
  }

  const importedCutoff = normalizeCutoff(rawCutoff);
  const sourceTransactions = Array.isArray(payload?.transactions)
    ? payload.transactions.filter((t) => !rawCutoff.id || t.cutoffId === rawCutoff.id)
    : [];
  const cutoffId = createId("cutoff");
  const importedTransactions = sourceTransactions.map((t) =>
    normalizeTransaction({ ...t, id: createId("txn"), cutoffId }),
  );
  return {
    cutoff: { ...importedCutoff, id: cutoffId, name: importedCutoff.name || "Imported cutoff" },
    transactions: importedTransactions,
  };
}

function importFullExport(payload) {
  const cutoffs = Array.isArray(payload.cutoffs) ? payload.cutoffs : [];
  const allTransactions = Array.isArray(payload.transactions) ? payload.transactions : [];

  return cutoffs.map((rawCutoff) => {
    const originalId = safeText(rawCutoff?.id);
    const cutoffId = createId("cutoff");
    const importedCutoff = normalizeCutoff(rawCutoff);
    const txns = allTransactions
      .filter((t) => t.cutoffId === originalId)
      .map((t) => normalizeTransaction({ ...t, id: createId("txn"), cutoffId }));
    return { cutoff: { ...importedCutoff, id: cutoffId }, transactions: txns };
  });
}

export async function parseImportFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed?.type === "full-export" && Array.isArray(parsed.cutoffs)) {
    return importFullExport(parsed);
  }
  return [importCutoffPackage(parsed)];
}
