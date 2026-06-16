export function renderDashboardPage(context) {
  const { appState, elements, view, helpers } = context;
  const { getCutoffTotals, formatDate, formatMoney, escapeHtml } = helpers;

  if (view.name !== "dashboard") return;

  if (!appState.cutoffs.length) {
    elements.cutoffList.innerHTML = `<p class="empty-state">No cutoffs yet — tap <strong>+</strong> to create one.</p>`;
    return;
  }

  elements.cutoffList.innerHTML = appState.cutoffs
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((cutoff) => {
      const totals = getCutoffTotals(cutoff.id);
      const balance = totals.income - totals.expenses;
      const spentRatio =
        cutoff.budget > 0 ? Math.min((totals.expenses / cutoff.budget) * 100, 100) : 0;

      return `
        <article class="cutoff-card${cutoff.locked ? " locked" : ""}" data-cutoff-id="${cutoff.id}">
          <div class="cutoff-card-main">
            <div class="cutoff-card-info">
              <h3>${escapeHtml(cutoff.name)}${cutoff.locked ? " <span class=\"lock-badge\">&#128274;</span>" : ""}</h3>
              <p class="cutoff-meta">${formatDate(cutoff.startDate)} – ${formatDate(cutoff.endDate)}</p>
            </div>
            <div class="cutoff-card-amount">
              <strong class="${balance >= 0 ? "amount-positive" : "amount-negative"}">${formatMoney(balance)}</strong>
              <p class="cutoff-meta">remaining</p>
            </div>
          </div>
          <div class="progress" aria-hidden="true">
            <div class="progress-bar" style="width: ${spentRatio}%"></div>
          </div>
          <div class="cutoff-actions">
            ${cutoff.locked
              ? `<button class="chip-button" type="button" data-action="unlock-cutoff" data-cutoff-id="${cutoff.id}">&#128275; Unlock</button>`
              : `<button class="chip-button" type="button" data-action="edit-cutoff" data-cutoff-id="${cutoff.id}">Edit</button>
                 <button class="chip-button" type="button" data-action="lock-cutoff" data-cutoff-id="${cutoff.id}">&#128274; Lock</button>`
            }
            <button class="chip-button danger" type="button" data-action="delete-cutoff" data-cutoff-id="${cutoff.id}">Delete</button>
          </div>
          <button class="cutoff-more-btn" type="button" data-action="toggle-actions" aria-label="More actions">⋯</button>
        </article>
      `;
    })
    .join("");
}