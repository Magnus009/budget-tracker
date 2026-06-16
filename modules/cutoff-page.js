import { DASHBOARD_CATEGORIES } from "./state.js";

export function renderCutoffPage(context) {
  const { appState, elements, view, helpers } = context;
  const {
    getCategoryTotal,
    getFilteredTransactions,
    formatDate,
    formatMoney,
    escapeHtml,
  } = helpers;

  if (view.name !== "cutoff") return;

  const cutoff = appState.cutoffs.find((c) => c.id === view.cutoffId);
  if (!cutoff) {
    window.location.hash = "";
    return;
  }

  elements.cutoffDetailTitle.textContent = cutoff.name;

  // Financial Overview
  const totalIncome   = getCategoryTotal(cutoff.id, "INCOME");
  const totalExpenses = getCategoryTotal(cutoff.id, "EXPENSES")
                      + getCategoryTotal(cutoff.id, "DEBTS")
                      + getCategoryTotal(cutoff.id, "BILLS");
  const totalSavings  = getCategoryTotal(cutoff.id, "SAVINGS");
  const remaining     = totalIncome - (totalExpenses + totalSavings);
  const sign = v => v < 0 ? "-" : "";

  elements.activeCutoffSummary.textContent =
    `${formatDate(cutoff.startDate)} \u2013 ${formatDate(cutoff.endDate)}` +
    (cutoff.notes ? ` \u00b7 ${cutoff.notes}` : "");
  elements.overviewIncome.textContent    = `+${formatMoney(totalIncome)}`;
  elements.overviewExpenses.textContent  = `-${formatMoney(totalExpenses)}`;
  elements.overviewSavings.textContent   = `-${formatMoney(totalSavings)}`;
  elements.overviewTotal.textContent     = `${sign(remaining)}${formatMoney(Math.abs(remaining))}`;

  // Cash Flow table
  const CATEGORY_DOTS = {
    INCOME:   { color: "var(--income-accent)",   text: "var(--income-text)" },
    EXPENSES: { color: "var(--expenses-accent)", text: "var(--expenses-text)" },
    SAVINGS:  { color: "var(--savings-accent)",  text: "var(--savings-text)" },
    DEBTS:    { color: "var(--debts-accent)",    text: "var(--debts-text)" },
    BILLS:    { color: "var(--bills-accent)",    text: "var(--bills-text)" },
  };

  let expectedBalance = 0;
  let actualBalance   = 0;

  elements.cashFlowBody.innerHTML = DASHBOARD_CATEGORIES.map(category => {
    const isIncome = category === "INCOME";
    const actual   = getCategoryTotal(cutoff.id, category);
    const expected = isIncome
      ? (cutoff.incomeItems || []).reduce((s, i) => s + i.expected, 0)
      : (cutoff.planItems   || []).filter(i => i.category === category).reduce((s, i) => s + i.expected, 0);

    if (isIncome) {
      expectedBalance += expected;
      actualBalance   += actual;
    } else {
      expectedBalance -= expected;
      actualBalance   -= actual;
    }

    const sign    = isIncome ? "+" : "-";
    const dot     = CATEGORY_DOTS[category];
    const actCls  = isIncome ? "amount-positive" : "amount-negative";
    return `
      <tr data-category="${category}" class="cash-flow-row">
        <td>
          <span class="cash-flow-cat-dot" style="background:${dot.color}"></span>
          <span style="color:${dot.text}">${category}</span>
        </td>
        <td class="right">${sign}${formatMoney(expected)}</td>
        <td class="right ${actCls}">${sign}${formatMoney(actual)}</td>
      </tr>
    `;
  }).join("");

  const expBal = v => v < 0 ? "-" : "";
  elements.cashFlowExpectedTotal.textContent = `${expBal(expectedBalance)}${formatMoney(Math.abs(expectedBalance))}`;
  elements.cashFlowActualTotal.textContent   = `${expBal(actualBalance)}${formatMoney(Math.abs(actualBalance))}`;
  if (actualBalance < 0) elements.cashFlowActualTotal.classList.add("amount-negative");
  else elements.cashFlowActualTotal.classList.remove("amount-negative");

  // Transaction ledger
  const transactions = getFilteredTransactions();

  if (!transactions.length) {
    elements.transactionList.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <strong>No entries yet.</strong>
            <p>Select a category above to add entries.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const locked = cutoff.locked === true;

  const CATEGORY_CSS = {
    INCOME: "income", EXPENSES: "expenses", SAVINGS: "savings", DEBTS: "debts", BILLS: "bills",
  };

  elements.transactionList.innerHTML = transactions
    .map((t) => {
      const amountClass = t.type === "income" ? "amount-positive" : "amount-negative";
      const sign = t.type === "income" ? "+" : "-";
      const catClass = CATEGORY_CSS[t.category] || "expenses";
      return `
        <tr class="ledger-row ledger-row--${catClass}">
          <td>${formatDate(t.date)}</td>
          <td>${escapeHtml(t.note || "-")}</td>
          <td class="right ${amountClass}">${sign}${formatMoney(t.amount)}</td>
        </tr>
      `;
    })
    .join("");
}
