const CATEGORY_CSS = {
  INCOME: "income",
  EXPENSES: "expenses",
  SAVINGS: "savings",
  DEBTS: "debts",
  BILLS: "bills",
};

export function renderCategoryPage(context) {
  const { appState, elements, helpers, view } = context;
  const { formatMoney, escapeHtml } = helpers;

  if (view.name !== "category") return;

  const { cutoffId, category } = view;
  const cutoff = appState.cutoffs.find(c => c.id === cutoffId);

  elements.categoryScreenTitle.textContent = category;

  const locked = cutoff?.locked === true;

  // Style the plan panel with category color
  const cssClass = CATEGORY_CSS[category] || "expenses";
  elements.categoryPlanPanel.className = `panel collapsible category-plan-panel ${cssClass}`;
  elements.categoryPlanTitle.textContent = category === "INCOME" ? "Income Sources" : `${category} Plan`;

  // Populate plan rows
  elements.categoryPlanBody.innerHTML = "";
  let totalExp = 0, totalAct = 0;

  const planRows = category === "INCOME"
    ? (cutoff?.incomeItems || []).map(item => ({ ...item, itemType: "income" }))
    : (cutoff?.planItems || []).filter(i => i.category === category).map(item => ({ ...item, itemType: "plan" }));

  planRows.forEach(item => {
    const subItems = item.itemType === "plan" ? (item.subItems || []) : [];
    const hasSubItems = subItems.length > 0;
    const effectiveExpected = hasSubItems
      ? subItems.reduce((s, si) => s + si.amount, 0)
      : (item.expected || 0);
    const effectiveActual = hasSubItems
      ? subItems.filter(si => si.paid).reduce((s, si) => s + si.amount, 0)
      : (item.actual || 0);

    totalExp += effectiveExpected;
    totalAct += effectiveActual;

    const row = document.createElement("tr");
    row.className = "category-plan-row";
    row.dataset.itemId = item.id;
    row.dataset.itemType = item.itemType;

    if (locked) {
      row.innerHTML = `
        <td class="col-toggle">${item.itemType === "plan" && hasSubItems ? `<button type="button" class="sub-toggle-btn" data-for="${item.id}" aria-label="Expand">▶</button>` : ""}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${formatMoney(effectiveExpected)}</td>
        <td>${formatMoney(effectiveActual)}</td>
        <td></td>
      `;
    } else {
      const toggleBtn = item.itemType === "plan"
        ? `<button type="button" class="sub-toggle-btn" data-for="${item.id}" aria-label="Expand">▶</button>`
        : "";
      const expectedCell = item.itemType === "plan" && hasSubItems
        ? `<span class="plan-expected-display" data-value="${effectiveExpected}">${formatMoney(effectiveExpected)}</span>`
        : `<input class="plan-expected-input" type="number" min="0" step="0.01" value="${item.expected || ""}" placeholder="0.00" />`;
      const actualCell = item.itemType === "plan" && hasSubItems
        ? `<span class="plan-actual-display" data-value="${effectiveActual}">${formatMoney(effectiveActual)}</span>`
        : `<input class="plan-actual-input" type="number" min="0" step="0.01" value="${item.actual || ""}" placeholder="0.00" />`;
      row.innerHTML = `
        <td class="col-toggle">${toggleBtn}</td>
        <td><input class="plan-desc-input" type="text" value="${escapeHtml(item.description)}" placeholder="Description" /></td>
        <td>${expectedCell}</td>
        <td>${actualCell}</td>
        <td><button type="button" class="chip-button danger remove-plan-row-btn" aria-label="Remove">&#10005;</button></td>
      `;
    }
    elements.categoryPlanBody.appendChild(row);

    // Append sub-item rows + add-row footer (plan items only)
    if (item.itemType === "plan") {
      subItems.forEach(si => {
        const siRow = document.createElement("tr");
        siRow.className = "sub-item-row";
        siRow.dataset.parentId = item.id;
        siRow.dataset.subId = si.id;
        siRow.hidden = true;
        if (locked) {
          siRow.innerHTML = `
            <td class="col-toggle"></td>
            <td class="sub-item-indent">${escapeHtml(si.description)}</td>
            <td>${formatMoney(si.amount)}</td>
            <td class="col-paid">${si.paid ? "✓" : ""}</td>
            <td></td>
          `;
        } else {
          siRow.innerHTML = `
            <td class="col-toggle"></td>
            <td class="sub-item-indent"><input class="sub-desc-input" type="text" value="${escapeHtml(si.description)}" placeholder="Description" /></td>
            <td><input class="sub-amount-input" type="number" min="0" step="0.01" value="${si.amount || ""}" placeholder="0.00" /></td>
            <td class="col-paid"><label class="sub-paid-label"><input type="checkbox" class="sub-paid-check" data-parent-id="${item.id}" ${si.paid ? "checked" : ""}/></label></td>
            <td><button type="button" class="chip-button danger remove-sub-item-btn" data-parent-id="${item.id}" aria-label="Remove sub-item">&#10005;</button></td>
          `;
        }
        elements.categoryPlanBody.appendChild(siRow);
      });

      if (!locked) {
        const addRow = document.createElement("tr");
        addRow.className = "add-sub-item-row";
        addRow.dataset.parentId = item.id;
        addRow.hidden = true;
        addRow.innerHTML = `
          <td colspan="5" class="add-sub-item-cell">
            <button type="button" class="chip-button add-sub-item-btn" data-parent-id="${item.id}">+ Sub-item</button>
          </td>
        `;
        elements.categoryPlanBody.appendChild(addRow);
      }
    }
  });

  elements.categoryPlanTotalExpected.textContent = formatMoney(totalExp);
  elements.categoryPlanTotalActual.textContent = formatMoney(totalAct);
  elements.addCategoryPlanRowBtn.hidden = locked;
  elements.saveCategoryPlanBtn.hidden   = locked;
}
