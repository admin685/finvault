# FinVault Engineering Rules

1. Any field format change must be checked across API state, forms, tables, filters, exports, audit/search text, and wallet lifecycle logic before it is considered complete.
2. Shared business choices, such as supported assets and networks, must come from one source of truth and be reused by the UI instead of hard-coded in several screens.
3. Wallet safety checks must run on server writes, not only in the browser.
