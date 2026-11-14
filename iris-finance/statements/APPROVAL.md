# Iris owner statement review and approval POC

This branch extends the existing owner statement generator. No real owner balances were used. `statement_approval.mjs` supports:
1. Preparing an immutable copy of the statement with SHA-256 digest, monotonically numbered version per owner and month, and audit entries.
2. Independent Finance reviewer acceptance/rejection; no self-review.
3. Distinct Managing Broker approval/rejection; no overlap with preparer/reviewer.
4. Superseding stale versions without overwriting history; corrected events generate a new statement version.
5. Building a *portal handoff preview only*. `publishAllowed`, `sendAllowed` and `financialPostingAllowed` remain false for every state, including BROKER_APPROVED_INTERNAL.

Live Iris read-only API currently exposes **no statement / owner portal read or write endpoint**, so this is not deployed to the Iris owner portal. Persistent storage, transactional version locks and role-based authorization must be implemented before production; role strings in this prototype are not authentication.

Run `node iris-finance/statements/statement_approval.test.mjs`; 17 synthetic local assertions were run in Node (a code-equivalent draft). GitHub source must run CI before deployment.

Release blockers: verified owner/Books crosswalk, signed owner agreements, bank and trust reconciliation, complete settlement events, approved ownership snapshots, audited broker identity, portal destination mapping, approved PDF renderer and a supported portal publication API. No emails, portal statements, invoices or EFT created.
