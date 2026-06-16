# Budget Tracker

A local-first, mobile-friendly budget tracker with a dashboard-first layout, category drill-down screens, and per-cutoff JSON sharing.

## What it uses

- Browser-based storage with IndexedDB as the primary data store.
- localStorage fallback if IndexedDB is unavailable in a local-file session.
- JSON export/import for sharing a single cutoff between users or devices.
- Responsive layout for phone and desktop screens.
- Dashboard cards for INCOME, EXPENSES, SAVINGS, DEBTS, and BILLS.

## Open it locally

Open `index.html` in a modern browser. The app does not require online hosting.

If you later want a shared local network version, you can place these files behind any simple static file server. That is optional.

## Data model

- Cutoffs: name, date range, planned budget, notes.
- Transactions: date, type, category, amount, note, cutoff association.
- Settings: currency label.

## Recommended storage

Use IndexedDB for the best local performance and offline persistence. It is already implemented in the scaffold, with a localStorage fallback.

## JSON sharing

- Export a cutoff as JSON from the cutoff list.
- Import a cutoff JSON file from another user.
- This keeps sharing focused on one budget cycle at a time.

## Excel source

Your attached workbook can be mirrored into this app by creating cutoffs and entries with the same columns used in the spreadsheet. If you want, the next step can be a direct Excel import flow from the workbook format.# Budget Tracker