# Zoho Books fee invoice readback acceptance POC (UNDEPLOYED)

This module intentionally does not call Zoho Books. Current Iris Books connector confirms two service items and active 5% GST, but **does not expose the invoice creation/readback endpoints** needed to validate real invoices. No invoice has been created.

Once a staging API is available, produce a normalised, independently fetched Books response and compare organisation, owner Books customer ID, source reference, item ID, line tax ID, monetary base/GST, invoice total, status and returned Books invoice ID.

Synthetic test case: Furnished agreement fee $600 + $30 GST; expected $630. Deliberately reject missing GST, wrong customer, wrong org, duplicates with mismatching source ref, unexpected statuses, missing invoice ID and multi-line changes. No tests imply real Books backend behaviour.

All results permanently include `postingAllowed:false`; even a correct invoice readback must not itself trigger trust-to-operating cash transfers. Actual production implementation requires:
- specific approved test Books org/customer,
- access to Books invoice API in a sandbox or accountant-authorized test environment,
- confirmed supported custom field/reference mapping and tax behaviour,
- idempotency/retry write safeguards and duplicate check after uncertain response,
- accountant approval of revenue and trust liability postings,
- audited return of immutable Books invoice ID and evidence.

Run `node iris-finance/books/invoice_readback.test.mjs` with Node 20+.
