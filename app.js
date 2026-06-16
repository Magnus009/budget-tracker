import { renderDashboardPage } from "./modules/dashboard-page.js";
import { renderCutoffPage } from "./modules/cutoff-page.js";
import { renderCategoryPage } from "./modules/category-page.js";
import { storage, getStorageBackend } from "./modules/storage.js";
import {
  DEFAULT_STATE,
  DEFAULT_CURRENCY,
  DASHBOARD_CATEGORIES,
  clone,
  createId,
  todayValue,
  parseAmount,
  safeText,
  normalizeCategoryKey,
  normalizeCutoff,
  normalizeIncomeItem,
  normalizePlanItem,
  normalizeTransaction,
  normalizeState,
} from "./modules/state.js";
import { formatDate, formatMoney, escapeHtml, getCategoryLabel } from "./modules/formatters.js";
import {
  getActiveCutoff,
  getCutoffTotals,
  getCategoryTransactions,
  getCategoryTotal,
  getFilteredTransactions,
} from "./modules/queries.js";
import { exportCutoff, exportAll, parseImportFile } from "./modules/import-export.js";

const elements = {};
let appState = clone(DEFAULT_STATE);
let editingCutoffId = null;

// ─── View routing ─────────────────────────────────────────────────────────────

function getCurrentView() {
  const hash = window.location.hash.replace(/^#/, "");

  if (hash.startsWith("cutoff/")) {
    const rest = hash.slice("cutoff/".length);
    const catSep = rest.indexOf("/category/");
    if (catSep !== -1) {
      const cutoffId = decodeURIComponent(rest.slice(0, catSep));
      const category = normalizeCategoryKey(
        decodeURIComponent(rest.slice(catSep + "/category/".length)),
      );
      return {
        name: "category",
        cutoffId,
        category: DASHBOARD_CATEGORIES.includes(category) ? category : "EXPENSES",
      };
    }
    return { name: "cutoff", cutoffId: decodeURIComponent(rest), category: null };
  }

  return { name: "dashboard", cutoffId: null, category: null };
}

// ─── Status ───────────────────────────────────────────────────────────────────

function setStatus(message) {
  elements.statusLine.textContent = message;
}

function setStorageStatus() {
  const b = getStorageBackend();
  elements.storageStatus.textContent =
    b === "indexeddb" ? "IndexedDB" : b === "localStorage" ? "localStorage" : "memory";
}

// ─── Persist & render ─────────────────────────────────────────────────────────

async function persistState() {
  await storage.save(appState);
  setStorageStatus();
  render();
}

function makeHelpers(view) {
  const fmt = (amount) => formatMoney(amount, appState.settings.currencyLabel);
  const cutoffId = view?.cutoffId ?? null;
  return {
    getActiveCutoff: () => getActiveCutoff(appState),
    getCutoffTotals: (id) => getCutoffTotals(appState, id),
    getCategoryTotal: (id, category) => getCategoryTotal(appState, id, category),
    getCategoryTransactions: (id, category) => getCategoryTransactions(appState, id, category),
    getFilteredTransactions: () => getFilteredTransactions(appState, cutoffId ?? "all"),
    formatDate,
    formatMoney: fmt,
    escapeHtml,
    getCategoryLabel,
  };
}

function render() {
  const view = getCurrentView();
  const helpers = makeHelpers(view);

  // Always close drawer and sheet on navigation
  closeDrawer();
  closeCutoffSheet();

  // Sync active cutoff when entering cutoff detail
  if (view.name === "cutoff" && view.cutoffId) {
    appState.selectedCutoffId = view.cutoffId;
    const cutoff = appState.cutoffs.find(c => c.id === view.cutoffId);
    if (cutoff) {
      elements.lockCutoffBtn.textContent = cutoff.locked ? "\uD83D\uDD13 Unlock" : "\uD83D\uDD12 Lock";
      elements.lockCutoffBtn.title = cutoff.locked ? "Unlock this cutoff" : "Lock this cutoff";
      elements.lockCutoffBtn.classList.toggle("btn-chip-locked", cutoff.locked);
      elements.copyPrevPlanBtn.hidden = cutoff.locked;
    }
  }

  elements.currencyLabel.value = appState.settings.currencyLabel;
  elements.importInput.value = "";

  elements.dashboardView.style.display    = view.name === "dashboard" ? "flex" : "none";
  elements.cutoffDetailView.style.display = view.name === "cutoff"    ? "flex" : "none";
  elements.categoryScreen.style.display   = view.name === "category"  ? "flex" : "none";
  elements.fabNewCutoff.style.display     = view.name === "dashboard" ? ""     : "none";

  renderDashboardPage({ appState, elements, view, helpers });
  renderCutoffPage({ appState, elements, view, helpers });
  renderCategoryPage({ appState, elements, view, helpers });
}

// ─── Form defaults ────────────────────────────────────────────────────────────

function syncFormDefaults() {
  const now = todayValue();
  elements.cutoffStart.value = now;
  elements.cutoffEnd.value   = now;
  elements.cutoffName.value   = "";
  elements.cutoffNotes.value  = "";
  resetIncomeTable();
  resetPlanTables();
}

// ─── Income table helpers ────────────────────────────────────────────────────

function addIncomeRow(desc = "", expected = "", actual = "") {
  const row = document.createElement("tr");
  row.className = "income-row";
  row.innerHTML = `
    <td><input type="text" name="inc-desc" placeholder="e.g. Salary" value="${escapeHtml(String(desc))}" /></td>
    <td><input type="number" name="inc-expected" min="0" step="0.01" placeholder="0.00" value="${expected}" /></td>
    <td><input type="number" name="inc-actual" min="0" step="0.01" placeholder="0.00" value="${actual || ""}" /></td>
    <td><button type="button" class="chip-button danger remove-income-row" aria-label="Remove">&#10005;</button></td>
  `;
  elements.incomeSourcesBody.appendChild(row);
  updateIncomeTotals();
}

function updateIncomeTotals() {
  let totalExp = 0, totalAct = 0;
  elements.incomeSourcesBody.querySelectorAll(".income-row").forEach(row => {
    totalExp += parseAmount(row.querySelector('[name="inc-expected"]')?.value);
    totalAct += parseAmount(row.querySelector('[name="inc-actual"]')?.value);
  });
  elements.incomeTotalExpected.textContent = formatMoney(totalExp, appState.settings.currencyLabel);
  elements.incomeTotalActual.textContent   = formatMoney(totalAct, appState.settings.currencyLabel);
}

function resetIncomeTable() {
  elements.incomeSourcesBody.innerHTML = "";
  addIncomeRow();
}

// ─── Plan table helpers (EXPENSES / SAVINGS / DEBTS / BILLS) ────────────────

const NON_INCOME_CATEGORIES = ["EXPENSES", "SAVINGS", "DEBTS", "BILLS"];

function getPlanBody(category) {
  return elements.cutoffSheet.querySelector(`.plan-body[data-plan-category="${category}"]`);
}

function getPlanTotal(category) {
  return elements.cutoffSheet.querySelector(`.plan-total[data-plan-category="${category}"]`);
}

function addPlanRow(category, desc = "", expected = "") {
  const body = getPlanBody(category);
  if (!body) return;
  const row = document.createElement("tr");
  row.className = "plan-row";
  row.innerHTML = `
    <td><input type="text" class="plan-desc" placeholder="e.g. Rent" value="${escapeHtml(String(desc))}" /></td>
    <td><input type="number" class="plan-expected" min="0" step="0.01" placeholder="0.00" value="${expected || ""}" /></td>
    <td><button type="button" class="chip-button danger remove-plan-row" data-category="${category}" aria-label="Remove">&#10005;</button></td>
  `;
  body.appendChild(row);
  updatePlanTotal(category);
}

function updatePlanTotal(category) {
  const body = getPlanBody(category);
  const totalEl = getPlanTotal(category);
  if (!body || !totalEl) return;
  let total = 0;
  body.querySelectorAll(".plan-expected").forEach(input => { total += parseAmount(input.value); });
  totalEl.textContent = total > 0 ? formatMoney(total, appState.settings.currencyLabel) : "—";
}

function resetPlanTables() {
  NON_INCOME_CATEGORIES.forEach(cat => {
    const body = getPlanBody(cat);
    if (body) { body.innerHTML = ""; addPlanRow(cat); }
  });
}

function collectPlanItems() {
  const items = [];
  NON_INCOME_CATEGORIES.forEach(category => {
    const body = getPlanBody(category);
    if (!body) return;
    body.querySelectorAll(".plan-row").forEach(row => {
      const desc     = safeText(row.querySelector(".plan-desc")?.value);
      const expected = parseAmount(row.querySelector(".plan-expected")?.value);
      if (desc || expected > 0) items.push({ category, description: desc || category, expected });
    });
  });
  return items;
}

function collectIncomeItems() {
  const items = [];
  elements.incomeSourcesBody.querySelectorAll(".income-row").forEach(row => {
    const desc     = safeText(row.querySelector('[name="inc-desc"]')?.value);
    const expected = parseAmount(row.querySelector('[name="inc-expected"]')?.value);
    const actual   = parseAmount(row.querySelector('[name="inc-actual"]')?.value);
    if (desc || expected > 0) items.push({ description: desc || "Income", expected, actual });
  });
  return items;
}

// ─── Edit mode: transactions ───────────────────────────────────────────────────

function beginEditTransaction(transactionId) {
  const txn = appState.transactions.find((t) => t.id === transactionId);
  if (!txn) return;
  window.location.hash = `cutoff/${encodeURIComponent(txn.cutoffId)}/category/${encodeURIComponent(txn.category)}`;
}

// ─── Edit mode: cutoffs ───────────────────────────────────────────────────────

function beginEditCutoff(cutoffId) {
  const cutoff = appState.cutoffs.find((c) => c.id === cutoffId);
  if (cutoff?.locked) { setStatus(`"${cutoff.name}" is locked. Unlock it first.`); return; }
  if (!cutoff) return;
  editingCutoffId = cutoffId;
  elements.cutoffName.value   = cutoff.name;
  elements.cutoffStart.value  = cutoff.startDate;
  elements.cutoffEnd.value    = cutoff.endDate;
  elements.cutoffNotes.value  = cutoff.notes;
  elements.incomeSourcesBody.innerHTML = "";
  const items = cutoff.incomeItems?.length
    ? cutoff.incomeItems
    : [{ description: "Income", expected: cutoff.budget, actual: 0 }];
  items.forEach(item => addIncomeRow(item.description, item.expected, item.actual));
  updateIncomeTotals();
  NON_INCOME_CATEGORIES.forEach(cat => {
    const body = getPlanBody(cat);
    if (!body) return;
    body.innerHTML = "";
    const planItems = (cutoff.planItems || []).filter(i => i.category === cat);
    planItems.length > 0
      ? planItems.forEach(item => addPlanRow(cat, item.description, item.expected))
      : addPlanRow(cat);
  });
  elements.cutoffSubmitBtn.textContent   = "Update cutoff";
  elements.cutoffCancelEditBtn.hidden    = false;
  openCutoffSheet("Edit cutoff");
  setStatus("Editing cutoff — update and save.");
}

function cancelEditCutoff() {
  editingCutoffId = null;
  elements.cutoffSubmitBtn.textContent = "Add cutoff";
  elements.cutoffCancelEditBtn.hidden  = true;
  closeCutoffSheet();
  syncFormDefaults();
}

// ─── Overlay / Drawer / Sheet ─────────────────────────────────────────────

function _syncOverlay() {
  const anyOpen =
    elements.menuDrawer.classList.contains("open") ||
    elements.cutoffSheet.classList.contains("open");
  elements.overlay.hidden = !anyOpen;
  document.body.classList.toggle("overlay-open", anyOpen);
}

function openDrawer() {
  elements.menuDrawer.classList.add("open");
  _syncOverlay();
}

function closeDrawer() {
  elements.menuDrawer.classList.remove("open");
  _syncOverlay();
}

function openCutoffSheet(title = "New cutoff") {
  elements.cutoffSheetTitle.textContent = title;
  elements.cutoffSheet.classList.add("open");
  _syncOverlay();
}

function closeCutoffSheet() {
  elements.cutoffSheet.classList.remove("open");
  _syncOverlay();
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleAddCutoff(event) {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    const incomeItems = collectIncomeItems();
    const planItems   = collectPlanItems().map(normalizePlanItem);
    if (!incomeItems.length) { setStatus("Add at least one income source."); return; }

  if (editingCutoffId) {
    const existing = appState.cutoffs.find((c) => c.id === editingCutoffId);
    if (existing) {
      const budget = incomeItems.reduce((s, i) => s + (i.actual > 0 ? i.actual : i.expected), 0);
      // Sync linked income transactions: update existing, create new, remove deleted
      const oldItems = existing.incomeItems || [];
      const newItems = incomeItems.map((item, idx) => {
        const old = oldItems[idx];
        const txnId = old?.transactionId || normalizeIncomeItem({}).transactionId;
        const amount = item.actual > 0 ? item.actual : item.expected;
        const existingTxn = appState.transactions.find(t => t.id === old?.transactionId);
        if (existingTxn) {
          appState.transactions = appState.transactions.map(t =>
            t.id === existingTxn.id
              ? { ...t, amount, note: item.description || "Income", date: existing.startDate }
              : t
          );
          return { ...normalizeIncomeItem(item), transactionId: existingTxn.id };
        } else {
          const txn = normalizeTransaction({
            cutoffId: editingCutoffId, type: "income", category: "INCOME",
            amount, note: item.description || "Income", date: existing.startDate,
          });
          appState.transactions = [txn, ...appState.transactions];
          return { ...normalizeIncomeItem(item), transactionId: txn.id };
        }
      });
      // Remove transactions for deleted income items
      const removedTxnIds = oldItems
        .filter((o, i) => i >= newItems.length && o.transactionId)
        .map(o => o.transactionId);
      appState.transactions = appState.transactions.filter(t => !removedTxnIds.includes(t.id));
      const updated = {
        ...existing,
        name:        safeText(form.get("name")) || "Untitled cutoff",
        startDate:   safeText(form.get("startDate")) || todayValue(),
        endDate:     safeText(form.get("endDate"))   || todayValue(),
        incomeItems: newItems,
        budget,
        planItems,
        notes:       safeText(form.get("notes")),
      };
      appState.cutoffs = appState.cutoffs.map((c) => (c.id === editingCutoffId ? updated : c));
      cancelEditCutoff();
      await persistState();
      setStatus(`Updated "${updated.name}".`);
    }
    return;
  }

  const rawCutoff = normalizeCutoff({
    name:        form.get("name"),
    startDate:   form.get("startDate"),
    endDate:     form.get("endDate"),
    incomeItems,
    notes:       form.get("notes"),
    planItems,
  });
  // Create one income transaction per income item
  const linkedItems = rawCutoff.incomeItems.map(item => {
    const amount = item.actual > 0 ? item.actual : item.expected;
    const txn = normalizeTransaction({
      cutoffId: rawCutoff.id, type: "income", category: "INCOME",
      amount, note: item.description || "Income", date: rawCutoff.startDate,
    });
    appState.transactions = [txn, ...appState.transactions];
    return { ...item, transactionId: txn.id };
  });
  const cutoff = { ...rawCutoff, incomeItems: linkedItems };
  appState.cutoffs = [cutoff, ...appState.cutoffs];
  appState.selectedCutoffId = cutoff.id;
  closeCutoffSheet();
  event.currentTarget.reset();
  resetIncomeTable();
  syncFormDefaults();
  await persistState();
  window.location.hash = `cutoff/${encodeURIComponent(cutoff.id)}`;
  setStatus(`Added "${cutoff.name}".`);
  } catch (err) {
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleSaveCategoryPlan() {
  const view = getCurrentView();
  if (!view.cutoffId || !view.category) return;
  const cutoff = appState.cutoffs.find(c => c.id === view.cutoffId);
  if (!cutoff || cutoff.locked) { setStatus("This cutoff is locked."); return; }
  const category = view.category;

  if (category === "INCOME") {
    const updatedItems = [];
    elements.categoryPlanBody.querySelectorAll(".category-plan-row").forEach(row => {
      const itemId   = row.dataset.itemId;
      const desc     = safeText(row.querySelector(".plan-desc-input")?.value) || "Income";
      const expected = parseAmount(row.querySelector(".plan-expected-input")?.value);
      const actual   = parseAmount(row.querySelector(".plan-actual-input")?.value);
      const amount   = actual > 0 ? actual : expected;
      const existingItem = (cutoff.incomeItems || []).find(i => i.id === itemId);
      if (existingItem) {
        if (existingItem.transactionId) {
          appState.transactions = appState.transactions.map(t =>
            t.id === existingItem.transactionId ? { ...t, amount, note: desc } : t
          );
        } else {
          const txn = normalizeTransaction({ cutoffId: cutoff.id, type: "income", category: "INCOME", amount, note: desc, date: cutoff.startDate });
          appState.transactions = [txn, ...appState.transactions];
          existingItem.transactionId = txn.id;
        }
        updatedItems.push({ ...existingItem, description: desc, expected, actual, transactionId: existingItem.transactionId });
      } else {
        if (!desc && expected === 0 && actual === 0) return;
        const txn = normalizeTransaction({ cutoffId: cutoff.id, type: "income", category: "INCOME", amount, note: desc, date: cutoff.startDate });
        appState.transactions = [txn, ...appState.transactions];
        updatedItems.push(normalizeIncomeItem({ description: desc, expected, actual, transactionId: txn.id }));
      }
    });
    const budget = updatedItems.reduce((s, i) => s + (i.actual > 0 ? i.actual : i.expected), 0);
    appState.cutoffs = appState.cutoffs.map(c =>
      c.id === view.cutoffId ? { ...c, incomeItems: updatedItems, budget } : c
    );
  } else {
    const updatedItems = [];
    elements.categoryPlanBody.querySelectorAll(".category-plan-row").forEach(row => {
      const itemId   = row.dataset.itemId;
      const desc     = safeText(row.querySelector(".plan-desc-input")?.value) || category;

      // Collect sub-items from sibling rows
      const subItemRows = [...elements.categoryPlanBody.querySelectorAll(`.sub-item-row[data-parent-id="${itemId}"]`)];
      const subItems = subItemRows
        .map(sr => ({
          id: sr.dataset.subId || createId("sub"),
          description: safeText(sr.querySelector(".sub-desc-input")?.value) || "",
          amount: parseAmount(sr.querySelector(".sub-amount-input")?.value),
          paid: sr.querySelector(".sub-paid-check")?.checked === true,
        }))
        .filter(si => si.description || si.amount > 0);
      const expected = subItems.length > 0
        ? subItems.reduce((s, si) => s + si.amount, 0)
        : parseAmount(row.querySelector(".plan-expected-input")?.value);
      const actual = subItems.length > 0
        ? subItems.filter(si => si.paid).reduce((s, si) => s + si.amount, 0)
        : parseAmount(row.querySelector(".plan-actual-input")?.value);

      const existingItem = (cutoff.planItems || []).find(i => i.id === itemId);
      if (existingItem) {
        let transactionId = existingItem.transactionId;
        if (actual > 0) {
          if (transactionId) {
            appState.transactions = appState.transactions.map(t =>
              t.id === transactionId ? { ...t, amount: actual, note: desc } : t
            );
          } else {
            const txn = normalizeTransaction({ cutoffId: cutoff.id, type: "expense", category, amount: actual, note: desc, date: cutoff.startDate });
            appState.transactions = [txn, ...appState.transactions];
            transactionId = txn.id;
          }
        } else if (transactionId) {
          appState.transactions = appState.transactions.filter(t => t.id !== transactionId);
          transactionId = null;
        }
        updatedItems.push({ ...existingItem, description: desc, expected, actual, transactionId, subItems });
      } else {
        if (!desc && expected === 0 && actual === 0) return;
        let transactionId = null;
        if (actual > 0) {
          const txn = normalizeTransaction({ cutoffId: cutoff.id, type: "expense", category, amount: actual, note: desc, date: cutoff.startDate });
          appState.transactions = [txn, ...appState.transactions];
          transactionId = txn.id;
        }
        updatedItems.push(normalizePlanItem({ category, description: desc, expected, actual, transactionId, subItems }));
      }
    });
    const otherPlanItems = (cutoff.planItems || []).filter(i => i.category !== category);
    const removedTxnIds = (cutoff.planItems || [])
      .filter(i => i.category === category && i.transactionId && !updatedItems.find(u => u.id === i.id))
      .map(i => i.transactionId);
    if (removedTxnIds.length) {
      appState.transactions = appState.transactions.filter(t => !removedTxnIds.includes(t.id));
    }
    appState.cutoffs = appState.cutoffs.map(c =>
      c.id === view.cutoffId ? { ...c, planItems: [...otherPlanItems, ...updatedItems] } : c
    );
  }
  await persistState();
  setStatus("Saved.");
}

function addCategoryPlanRow() {
  const view = getCurrentView();
  const cutoff = appState.cutoffs.find(c => c.id === view.cutoffId);
  if (cutoff?.locked) { setStatus("This cutoff is locked."); return; }
  const itemId = createId("plan-new");
  const row = document.createElement("tr");
  row.className = "category-plan-row";
  row.dataset.itemId = itemId;
  row.innerHTML = `
    <td class="col-toggle"><button type="button" class="sub-toggle-btn" data-for="${itemId}" aria-label="Expand">▶</button></td>
    <td><input class="plan-desc-input" type="text" placeholder="Description" /></td>
    <td><input class="plan-expected-input" type="number" min="0" step="0.01" placeholder="0.00" /></td>
    <td><input class="plan-actual-input" type="number" min="0" step="0.01" placeholder="0.00" /></td>
    <td><button type="button" class="chip-button danger remove-plan-row-btn" aria-label="Remove">&#10005;</button></td>
  `;
  const addSubRow = document.createElement("tr");
  addSubRow.className = "add-sub-item-row";
  addSubRow.dataset.parentId = itemId;
  addSubRow.hidden = true;
  addSubRow.innerHTML = `
    <td colspan="5" class="add-sub-item-cell">
      <button type="button" class="chip-button add-sub-item-btn" data-parent-id="${itemId}">+ Sub-item</button>
    </td>
  `;
  elements.categoryPlanBody.appendChild(row);
  elements.categoryPlanBody.appendChild(addSubRow);
  updateCategoryPlanTotals();
}

function updateCategoryPlanTotals() {
  let totalExp = 0, totalAct = 0;
  elements.categoryPlanBody.querySelectorAll(".category-plan-row").forEach(row => {
    const itemId = row.dataset.itemId;
    const siRows = [...elements.categoryPlanBody.querySelectorAll(`.sub-item-row[data-parent-id="${itemId}"]`)];
    if (siRows.length > 0) {
      totalExp += siRows.reduce((s, sr) => s + parseAmount(sr.querySelector(".sub-amount-input")?.value), 0);
      totalAct += siRows
        .filter(sr => sr.querySelector(".sub-paid-check")?.checked)
        .reduce((s, sr) => s + parseAmount(sr.querySelector(".sub-amount-input")?.value), 0);
    } else {
      totalExp += parseAmount(row.querySelector(".plan-expected-input")?.value);
      totalAct += parseAmount(row.querySelector(".plan-actual-input")?.value);
    }
  });
  const fmt = v => formatMoney(v, appState.settings.currencyLabel);
  elements.categoryPlanTotalExpected.textContent = fmt(totalExp);
  elements.categoryPlanTotalActual.textContent   = fmt(totalAct);
}


async function handleSaveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const label = safeText(form.get("currencyLabel")) || DEFAULT_CURRENCY;
  appState.settings.currencyLabel = label;
  await persistState();
  setStatus(`Currency set to "${label}".`);
}

async function handleExportCurrentCutoff() {
  const view = getCurrentView();
  if (!view.cutoffId) { setStatus("No cutoff open."); return; }
  const name = await exportCutoff(appState, view.cutoffId);
  setStatus(name ? `Exported "${name}".` : "Cutoff not found.");
}

async function handleExportAll() {
  const ok = await exportAll(appState);
  setStatus(ok ? `Exported all ${appState.cutoffs.length} cutoff(s).` : "No cutoffs to export.");
}

async function resetData() {
  if (!window.confirm("Delete all local budget data?")) return;
  appState = clone(DEFAULT_STATE);
  window.location.hash = "";
  await storage.clear();
  cancelEditCutoff();
  syncFormDefaults();
  render();
  setStorageStatus();
  setStatus("Data cleared.");
}

// ─── Click delegation ─────────────────────────────────────────────────────────

async function handleCutoffListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    const card = event.target.closest(".cutoff-card[data-cutoff-id]");
    if (card) window.location.hash = `cutoff/${encodeURIComponent(card.dataset.cutoffId)}`;
    return;
  }

  const { action, cutoffId } = button.dataset;

  if (action === "toggle-actions") {
    event.stopPropagation();
    const card = button.closest(".cutoff-card");
    const isOpen = card.classList.contains("actions-open");
    document.querySelectorAll(".cutoff-card.actions-open").forEach((c) => c.classList.remove("actions-open"));
    if (!isOpen) card.classList.add("actions-open");
    return;
  }

  if (action === "edit-cutoff") {
    beginEditCutoff(cutoffId);
    return;
  }

  if (action === "lock-cutoff") {
    const cutoff = appState.cutoffs.find(c => c.id === cutoffId);
    if (!cutoff) return;
    if (!window.confirm(`Lock "${cutoff.name}"? Locked cutoffs cannot be edited.`)) return;
    appState.cutoffs = appState.cutoffs.map(c => c.id === cutoffId ? { ...c, locked: true } : c);
    await persistState();
    setStatus(`"${cutoff.name}" locked.`);
    return;
  }

  if (action === "unlock-cutoff") {
    const cutoff = appState.cutoffs.find(c => c.id === cutoffId);
    if (!cutoff) return;
    appState.cutoffs = appState.cutoffs.map(c => c.id === cutoffId ? { ...c, locked: false } : c);
    await persistState();
    setStatus(`"${cutoff.name}" unlocked.`);
    return;
  }

  if (action === "delete-cutoff") {
    const cutoff = appState.cutoffs.find((c) => c.id === cutoffId);
    if (!cutoff) return;
    if (!window.confirm(`Delete "${cutoff.name}"? Its entries will also be removed.`)) return;
    appState.cutoffs       = appState.cutoffs.filter((c) => c.id !== cutoffId);
    appState.transactions  = appState.transactions.filter((t) => t.cutoffId !== cutoffId);
    if (appState.selectedCutoffId === cutoffId)
      appState.selectedCutoffId = appState.cutoffs[0]?.id ?? null;
    if (editingCutoffId === cutoffId) cancelEditCutoff();
    await persistState();
    setStatus(`Deleted "${cutoff.name}".`);
  }
}

async function handleCashFlowClick(event) {
  const row = event.target.closest("tr[data-category]");
  if (!row) return;
  const view = getCurrentView();
  if (!view.cutoffId) return;
  window.location.hash = `cutoff/${encodeURIComponent(view.cutoffId)}/category/${encodeURIComponent(row.dataset.category)}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  Object.assign(elements, {
    // Dashboard
    dashboardView:        document.getElementById("dashboardView"),
    cutoffForm:           document.getElementById("cutoffForm"),
    cutoffName:           document.getElementById("cutoffName"),
    cutoffStart:          document.getElementById("cutoffStart"),
    cutoffEnd:            document.getElementById("cutoffEnd"),
    incomeSourcesBody:    document.getElementById("incomeSourcesBody"),
    incomeTotalExpected:  document.getElementById("incomeTotalExpected"),
    incomeTotalActual:    document.getElementById("incomeTotalActual"),
    addIncomeRowBtn:      document.getElementById("addIncomeRowBtn"),
    cutoffNotes:          document.getElementById("cutoffNotes"),
    cutoffSubmitBtn:      document.getElementById("cutoffSubmitBtn"),
    cutoffCancelEditBtn:  document.getElementById("cutoffCancelEditBtn"),
    cutoffList:           document.getElementById("cutoffList"),
    exportAllBtn:         document.getElementById("exportAllBtn"),
    importInput:          document.getElementById("importInput"),
    resetBtn:             document.getElementById("resetBtn"),
    storageStatus:        document.getElementById("storageStatus"),
    // Overlay / drawer / sheet / FAB
    menuBtn:              document.getElementById("menuBtn"),
    menuDrawer:           document.getElementById("menuDrawer"),
    drawerCloseBtn:       document.getElementById("drawerCloseBtn"),
    overlay:              document.getElementById("overlay"),
    fabNewCutoff:         document.getElementById("fabNewCutoff"),
    cutoffSheet:          document.getElementById("cutoffSheet"),
    cutoffSheetTitle:     document.getElementById("cutoffSheetTitle"),
    cutoffSheetCloseBtn:  document.getElementById("cutoffSheetCloseBtn"),
    // Cutoff detail
    cutoffDetailView:          document.getElementById("cutoffDetailView"),
    cutoffDetailTitle:         document.getElementById("cutoffDetailTitle"),
    backToDashboardBtn:        document.getElementById("backToDashboardBtn"),
    exportBtn:                 document.getElementById("exportBtn"),
    lockCutoffBtn:             document.getElementById("lockCutoffBtn"),
    copyPrevPlanBtn:           document.getElementById("copyPrevPlanBtn"),
    activeCutoffSummary:       document.getElementById("activeCutoffSummary"),
    overviewIncome:            document.getElementById("overviewIncome"),
    overviewExpenses:          document.getElementById("overviewExpenses"),
    overviewSavings:           document.getElementById("overviewSavings"),
    overviewTotal:             document.getElementById("overviewTotal"),
    dashboardCategoryGrid:     null, // removed — replaced by cash flow table
    cashFlowBody:              document.getElementById("cashFlowBody"),
    cashFlowExpectedTotal:     document.getElementById("cashFlowExpectedTotal"),
    cashFlowActualTotal:       document.getElementById("cashFlowActualTotal"),
    transactionList:           document.getElementById("transactionList"),
    settingsForm:              document.getElementById("settingsForm"),
    currencyLabel:             document.getElementById("currencyLabel"),
    // Category
    categoryScreen:            document.getElementById("categoryScreen"),
    categoryScreenTitle:       document.getElementById("categoryScreenTitle"),

    backToCutoffBtn:           document.getElementById("backToCutoffBtn"),
    categoryPlanPanel:         document.getElementById("categoryPlanPanel"),
    categoryPlanTitle:         document.getElementById("categoryPlanTitle"),
    categoryPlanBody:          document.getElementById("categoryPlanBody"),
    categoryPlanTotalExpected: document.getElementById("categoryPlanTotalExpected"),
    categoryPlanTotalActual:   document.getElementById("categoryPlanTotalActual"),
    addCategoryPlanRowBtn:     document.getElementById("addCategoryPlanRowBtn"),
    saveCategoryPlanBtn:       document.getElementById("saveCategoryPlanBtn"),
    // Status
    statusLine: document.getElementById("statusLine"),
  });

  appState = normalizeState(await storage.load());
  syncFormDefaults();
  appState.settings.currencyLabel =
    safeText(appState.settings.currencyLabel) || DEFAULT_CURRENCY;
  render();
  setStorageStatus();
  setStatus("Ready.");

  elements.cutoffForm.addEventListener("submit", handleAddCutoff);
  elements.cutoffCancelEditBtn.addEventListener("click", cancelEditCutoff);
  elements.addIncomeRowBtn.addEventListener("click", () => addIncomeRow());

  elements.lockCutoffBtn.addEventListener("click", async () => {
    const view = getCurrentView();
    if (!view.cutoffId) return;
    const cutoff = appState.cutoffs.find(c => c.id === view.cutoffId);
    if (!cutoff) return;
    if (cutoff.locked) {
      appState.cutoffs = appState.cutoffs.map(c => c.id === view.cutoffId ? { ...c, locked: false } : c);
      await persistState();
      setStatus(`"${cutoff.name}" unlocked.`);
    } else {
      if (!window.confirm(`Lock "${cutoff.name}"? Locked cutoffs cannot be edited.`)) return;
      appState.cutoffs = appState.cutoffs.map(c => c.id === view.cutoffId ? { ...c, locked: true } : c);
      await persistState();
      setStatus(`"${cutoff.name}" locked.`);
    }
  });

  elements.copyPrevPlanBtn.addEventListener("click", async () => {
    const view = getCurrentView();
    if (!view.cutoffId) return;
    const source = appState.cutoffs
      .filter(c => c.id !== view.cutoffId && c.locked === true)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!source?.planItems?.length) { setStatus("No locked cutoff with a plan found."); return; }
    const current = appState.cutoffs.find(c => c.id === view.cutoffId);
    if (!current) return;
    const copied = source.planItems.map(i => normalizePlanItem({ ...i, id: null, actual: 0, transactionId: null }));
    appState.cutoffs = appState.cutoffs.map(c =>
      c.id === view.cutoffId ? { ...c, planItems: copied } : c
    );
    await persistState();
    setStatus(`Plan copied from "${source.name}".`);
  });
  elements.incomeSourcesBody.addEventListener("click", (e) => {
    if (e.target.closest(".remove-income-row")) {
      const rows = elements.incomeSourcesBody.querySelectorAll(".income-row");
      if (rows.length > 1) { e.target.closest(".income-row").remove(); updateIncomeTotals(); }
    }
  });
  elements.incomeSourcesBody.addEventListener("input", updateIncomeTotals);
  elements.saveCategoryPlanBtn.addEventListener("click", handleSaveCategoryPlan);
  elements.addCategoryPlanRowBtn.addEventListener("click", addCategoryPlanRow);
  elements.categoryPlanBody.addEventListener("click", (e) => {
    if (e.target.closest(".remove-plan-row-btn")) {
      const row = e.target.closest(".category-plan-row");
      if (row) {
        // Also remove associated sub-item and add-sub-item rows
        const itemId = row.dataset.itemId;
        if (itemId) {
          elements.categoryPlanBody.querySelectorAll(`[data-parent-id="${itemId}"]`).forEach(r => r.remove());
        }
        row.remove();
        updateCategoryPlanTotals();
      }
      return;
    }

    // Toggle sub-item rows
    if (e.target.closest(".sub-toggle-btn")) {
      const btn = e.target.closest(".sub-toggle-btn");
      const parentId = btn.dataset.for;
      const subRows = elements.categoryPlanBody.querySelectorAll(`[data-parent-id="${parentId}"]`);
      const isExpanded = btn.dataset.expanded === "true";
      subRows.forEach(r => { r.hidden = isExpanded; });
      btn.dataset.expanded = isExpanded ? "false" : "true";
      btn.textContent = isExpanded ? "▶" : "▼";
      return;
    }

    // Add a new sub-item row
    if (e.target.closest(".add-sub-item-btn")) {
      const parentId = e.target.closest(".add-sub-item-btn").dataset.parentId;
      const addRow = elements.categoryPlanBody.querySelector(`.add-sub-item-row[data-parent-id="${parentId}"]`);
      if (!addRow) return;
      const siRow = document.createElement("tr");
      siRow.className = "sub-item-row";
      siRow.dataset.parentId = parentId;
      siRow.dataset.subId = "";
      siRow.innerHTML = `
        <td class="col-toggle"></td>
        <td class="sub-item-indent"><input class="sub-desc-input" type="text" placeholder="Description" /></td>
        <td><input class="sub-amount-input" type="number" min="0" step="0.01" placeholder="0.00" /></td>
        <td class="col-paid"><label class="sub-paid-label"><input type="checkbox" class="sub-paid-check" data-parent-id="${parentId}" /></label></td>
        <td><button type="button" class="chip-button danger remove-sub-item-btn" data-parent-id="${parentId}" aria-label="Remove sub-item">&#10005;</button></td>
      `;
      elements.categoryPlanBody.insertBefore(siRow, addRow);
      // Switch expected and actual cells of parent row to display spans if not already
      const parentRow = elements.categoryPlanBody.querySelector(`.category-plan-row[data-item-id="${parentId}"]`);
      const expInput = parentRow?.querySelector(".plan-expected-input");
      if (expInput) {
        const span = document.createElement("span");
        span.className = "plan-expected-display";
        span.dataset.value = "0";
        span.textContent = formatMoney(0, appState.settings.currencyLabel);
        expInput.replaceWith(span);
      }
      const actInput = parentRow?.querySelector(".plan-actual-input");
      if (actInput) {
        const span = document.createElement("span");
        span.className = "plan-actual-display";
        span.dataset.value = "0";
        span.textContent = formatMoney(0, appState.settings.currencyLabel);
        actInput.replaceWith(span);
      }
      siRow.querySelector(".sub-desc-input").focus();
      updateCategoryPlanTotals();
      return;
    }

    // Remove a sub-item row
    if (e.target.closest(".remove-sub-item-btn")) {
      const btn = e.target.closest(".remove-sub-item-btn");
      const parentId = btn.dataset.parentId;
      btn.closest(".sub-item-row").remove();
      // If no sub-items remain, restore expected input on parent
      const remaining = elements.categoryPlanBody.querySelectorAll(`.sub-item-row[data-parent-id="${parentId}"]`);
      if (!remaining.length) {
        const parentRow = elements.categoryPlanBody.querySelector(`.category-plan-row[data-item-id="${parentId}"]`);
        const expSpan = parentRow?.querySelector(".plan-expected-display");
        if (expSpan) {
          const input = document.createElement("input");
          input.className = "plan-expected-input";
          input.type = "number"; input.min = "0"; input.step = "0.01"; input.placeholder = "0.00";
          expSpan.replaceWith(input);
        }
        const actSpan = parentRow?.querySelector(".plan-actual-display");
        if (actSpan) {
          const input = document.createElement("input");
          input.className = "plan-actual-input";
          input.type = "number"; input.min = "0"; input.step = "0.01"; input.placeholder = "0.00";
          actSpan.replaceWith(input);
        }
      }
      updateCategoryPlanTotals();
      return;
    }
  });
  elements.categoryPlanBody.addEventListener("input", updateCategoryPlanTotals);

  // Paid checkbox: update parent actual display live
  elements.categoryPlanBody.addEventListener("change", (e) => {
    const cb = e.target.closest(".sub-paid-check");
    if (!cb) return;
    const parentId = cb.dataset.parentId;
    const siRows = [...elements.categoryPlanBody.querySelectorAll(`.sub-item-row[data-parent-id="${parentId}"]`)];
    const paidTotal = siRows
      .filter(sr => sr.querySelector(".sub-paid-check")?.checked)
      .reduce((s, sr) => s + parseAmount(sr.querySelector(".sub-amount-input")?.value), 0);
    const parentRow = elements.categoryPlanBody.querySelector(`.category-plan-row[data-item-id="${parentId}"]`);
    const actSpan = parentRow?.querySelector(".plan-actual-display");
    if (actSpan) {
      actSpan.dataset.value = paidTotal;
      actSpan.textContent = formatMoney(paidTotal, appState.settings.currencyLabel);
    }
    updateCategoryPlanTotals();
  });

  elements.cutoffSheet.addEventListener("click", (e) => {
    const addBtn = e.target.closest(".add-plan-row-btn");
    if (addBtn) { addPlanRow(addBtn.dataset.planCategory); return; }
    const removeBtn = e.target.closest(".remove-plan-row");
    if (removeBtn) {
      const category = removeBtn.dataset.category;
      const body = getPlanBody(category);
      const rows = body?.querySelectorAll(".plan-row");
      if (rows?.length > 1) { removeBtn.closest(".plan-row").remove(); updatePlanTotal(category); }
    }
  });
  elements.cutoffSheet.addEventListener("input", (e) => {
    if (e.target.classList.contains("plan-expected")) {
      const cat = e.target.closest(".plan-row")?.querySelector(".remove-plan-row")?.dataset?.category;
      if (cat) updatePlanTotal(cat);
    }
  });
  elements.settingsForm.addEventListener("submit", handleSaveSettings);
  elements.exportBtn.addEventListener("click", handleExportCurrentCutoff);
  elements.exportAllBtn.addEventListener("click", handleExportAll);
  elements.resetBtn.addEventListener("click", resetData);
  elements.cutoffList.addEventListener("click", handleCutoffListClick);
  elements.cashFlowBody.addEventListener("click", handleCashFlowClick);

  elements.backToDashboardBtn.addEventListener("click", () => {
    window.location.hash = "";
  });

  elements.backToCutoffBtn.addEventListener("click", () => {
    const view = getCurrentView();
    window.location.hash = view.cutoffId
      ? `cutoff/${encodeURIComponent(view.cutoffId)}`
      : "";
  });

  elements.importInput.addEventListener("change", async () => {
    const [file] = elements.importInput.files ?? [];
    if (!file) return;
    try {
      const packages = await parseImportFile(file);
      const msg =
        packages.length === 1
          ? `Import "${packages[0].cutoff.name}"?`
          : `Import ${packages.length} cutoffs?`;
      if (!window.confirm(msg)) return;
      for (const pkg of packages) {
        appState.cutoffs       = [pkg.cutoff, ...appState.cutoffs];
        appState.transactions  = [...pkg.transactions, ...appState.transactions];
      }
      appState.selectedCutoffId = packages[0].cutoff.id;
      await persistState();
      window.location.hash = `cutoff/${encodeURIComponent(packages[0].cutoff.id)}`;
      setStatus(`Imported ${packages.length} cutoff(s).`);
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : "Invalid file."}`);
    }
    elements.importInput.value = "";
  });

  elements.menuBtn.addEventListener("click", openDrawer);
  elements.drawerCloseBtn.addEventListener("click", closeDrawer);
  elements.overlay.addEventListener("click", () => { closeDrawer(); closeCutoffSheet(); });
  elements.fabNewCutoff.addEventListener("click", () => openCutoffSheet("New cutoff"));
  elements.cutoffSheetCloseBtn.addEventListener("click", closeCutoffSheet);

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".cutoff-card")) {
      document.querySelectorAll(".cutoff-card.actions-open").forEach((c) => c.classList.remove("actions-open"));
    }
  });

  window.addEventListener("hashchange", render);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
