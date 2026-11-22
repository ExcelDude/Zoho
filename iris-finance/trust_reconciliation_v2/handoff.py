"""Read-only bridge between persisted Iris preview rows and trust reconciliation.

Preview allocations are deliberately not an accounting subledger. No amount of
matching synthetic data may certify an actual bank/Books/owner trust balance.
"""
from datetime import date
from typing import Mapping
from reconciliation_v2 import Pool, CutoffEvidence, Result, reconcile, REQUIRED_CODES, ALLOWED_CODES

class HandoffError(ValueError):
    pass

def _exact_keys(value, required):
    return isinstance(value, Mapping) and required.issubset(value)

def _cents(v):
    return type(v) is int and abs(v) <= 900_000_000_000_000

def _date(s):
    if not isinstance(s, str):
        raise HandoffError("INVALID_DATE")
    try:
        parsed = date.fromisoformat(s)
    except ValueError as exc:
        raise HandoffError("INVALID_DATE") from exc
    if parsed.isoformat() != s:
        raise HandoffError("INVALID_DATE")
    return parsed

def summarize_preview_export(payload: Mapping) -> dict:
    """Returns an informational only, non-reconciliation summary of persisted previews."""
    if not _exact_keys(payload, {"schema_version", "organization_id", "pool", "cutoff",
                                "source_kind", "events", "unresolved_case_count"}):
        raise HandoffError("INVALID_PREVIEW_EXPORT")
    if payload["schema_version"] != "iris-trust-preview-v1" or payload["organization_id"] != "110003520057" or payload["pool"] != "RENT":
        raise HandoffError("WRONG_ORGANIZATION_OR_POOL")
    cutoff = _date(payload["cutoff"])
    if payload["source_kind"] != "UNPOSTED_PREVIEW":
        raise HandoffError("PREVIEW_EXPORT_MUST_NOT_CLAIM_SETTLED")
    count = payload["unresolved_case_count"]
    if type(count) is not int or count < 0:
        raise HandoffError("INVALID_EXCEPTION_COUNT")
    events = payload["events"]
    if not isinstance(events, list):
        raise HandoffError("INVALID_EVENTS")
    seen_ids, seen_banks = set(), set()
    preview_cents = 0
    for e in events:
        if not _exact_keys(e, {"event_key", "bank_transaction_id", "event_date",
                               "amount_cents", "allocation_total_cents",
                               "allocation_count", "manifest_fingerprint"}):
            raise HandoffError("INVALID_PREVIEW_EVENT")
        key, bank = e["event_key"], e["bank_transaction_id"]
        if not isinstance(key, str) or not key or not isinstance(bank, str) or not bank:
            raise HandoffError("INVALID_SOURCE_IDENTIFIERS")
        if key in seen_ids or bank in seen_banks:
            raise HandoffError("DUPLICATE_PREVIEW_SOURCE")
        seen_ids.add(key)
        seen_banks.add(bank)
        d = _date(e["event_date"])
        if d > cutoff:
            raise HandoffError("PREVIEW_AFTER_CUTOFF")
        if not _cents(e["amount_cents"]) or e["amount_cents"] <= 0:
            raise HandoffError("INVALID_CENTS")
        if not _cents(e["allocation_total_cents"]) or e["amount_cents"] != e["allocation_total_cents"]:
            raise HandoffError("ALLOCATION_SUM_MISMATCH")
        if type(e["allocation_count"]) is not int or e["allocation_count"] < 1:
            raise HandoffError("ALLOCATION_COUNT_INVALID")
        if not isinstance(e["manifest_fingerprint"], str) or len(e["manifest_fingerprint"]) != 64:
            raise HandoffError("FINGERPRINT_MISSING")
        preview_cents += e["amount_cents"]
    return {"status": "INFORMATIONAL_PREVIEW_ONLY", "cutoff": cutoff.isoformat(),
            "pool": "RENT", "receipt_count": len(events),
            "unposted_preview_cents": preview_cents, "unresolved_case_count": count,
            "books_gl_verified": False, "bank_statement_verified": False,
            "subledger_verified": False, "may_approve": False, "posting_allowed": False,
            "warning": "Unposted receipts/owner reservations are not settled subledger liabilities."}

def reconcile_verified_handoff(payload: Mapping) -> Result:
    """Accept separately attested bank, Books and posted subledger evidence.

    Independent evidence and approval fields are mandatory; caller-supplied claims
    are NOT authentication. Only a separately authorized service can produce a
    trusted live report. This function never posts or approves anything.
    """
    required = {"schema_version", "organization_id", "pool", "cutoff", "bank",
                "books", "subledger", "review", "preview_source"}
    if not _exact_keys(payload, required):
        raise HandoffError("EVIDENCE_BUNDLE_INCOMPLETE")
    if payload["schema_version"] != "iris-certified-evidence-v1" or payload["organization_id"] != "110003520057":
        raise HandoffError("WRONG_EVIDENCE_SCHEMA_OR_ORG")
    try:
        pool = Pool(payload["pool"])
    except ValueError as exc:
        raise HandoffError("UNKNOWN_POOL") from exc
    cutoff = _date(payload["cutoff"])
    bank, books, sub, review = (payload[n] for n in ("bank", "books", "subledger", "review"))
    if payload["preview_source"] is not None:
        raise HandoffError("PREVIEW_DATA_CANNOT_CERTIFY_LEDGER")
    if not _exact_keys(bank, {"rbc_bank_id", "books_bank_account_id", "statement_cents",
                              "deposits_in_transit_cents", "outstanding_payments_cents",
                              "cutoff", "statement_reference", "timing_evidence_reference"}):
        raise HandoffError("BANK_EVIDENCE_INCOMPLETE")
    if not _exact_keys(books, {"cash_gl_cents", "liability_by_code_cents", "cutoff", "export_reference"}):
        raise HandoffError("BOOKS_EVIDENCE_INCOMPLETE")
    if not _exact_keys(sub, {"liability_by_code_cents", "cutoff", "ledger_export_reference", "posted_entries_only"}):
        raise HandoffError("SUBLEDGER_EVIDENCE_INCOMPLETE")
    approvals = ("mapping_approved_by", "bank_statement_approved_by", "books_gl_verified_by",
                 "subledger_verified_by", "independent_reviewed_by")
    if not _exact_keys(review, set(approvals)) or any(
        not isinstance(review[k], str) or not review[k].strip() for k in approvals
    ):
        raise HandoffError("ACCOUNTANT_APPROVALS_REQUIRED")
    if len(set(review.values())) == 1:
        raise HandoffError("INDEPENDENT_REVIEW_MISSING")
    if not all(isinstance(bank.get(k), str) and bank[k] for k in
               ("rbc_bank_id", "books_bank_account_id", "statement_reference", "timing_evidence_reference")):
        raise HandoffError("UNVERIFIED_BANK_IDENTIFIERS")
    if not all(isinstance(books.get(k), str) and books[k] for k in ("export_reference",)):
        raise HandoffError("BOOKS_EXPORT_REFERENCE_REQUIRED")
    if not isinstance(sub.get("ledger_export_reference"), str) or not sub["ledger_export_reference"]:
        raise HandoffError("SUBLEDGER_EXPORT_REFERENCE_REQUIRED")
    if sub["posted_entries_only"] is not True:
        raise HandoffError("UNPOSTED_PREVIEW_CANNOT_BE_SUBLEDGER")
    for label, doc in (("BANK", bank), ("BOOKS", books), ("SUBLEDGER", sub)):
        if _date(doc["cutoff"]) != cutoff:
            raise HandoffError(label+"_CUTOFF_MISMATCH")
    amounts = (bank["statement_cents"], bank["deposits_in_transit_cents"],
               bank["outstanding_payments_cents"], books["cash_gl_cents"])
    if not all(_cents(v) for v in amounts):
        raise HandoffError("NONINTEGER_MONEY")
    if not isinstance(books["liability_by_code_cents"], Mapping) or not isinstance(sub["liability_by_code_cents"], Mapping):
        raise HandoffError("LIABILITY_COMPONENTS_REQUIRED")
    for m in (books["liability_by_code_cents"], sub["liability_by_code_cents"]):
        if not REQUIRED_CODES[pool].issubset(set(m)):
            raise HandoffError("REQUIRED_GL_COMPONENT_MISSING")
        if set(m)-ALLOWED_CODES[pool] or not all(_cents(v) for v in m.values()):
            raise HandoffError("INVALID_GL_COMPONENTS")
    e = CutoffEvidence(
        pool=pool, cutoff=cutoff, bank_account_id=bank["rbc_bank_id"],
        books_bank_account_id=bank["books_bank_account_id"],
        bank_statement_cents=bank["statement_cents"],
        deposits_in_transit_cents=bank["deposits_in_transit_cents"],
        outstanding_payments_cents=bank["outstanding_payments_cents"],
        books_cash_gl_cents=books["cash_gl_cents"],
        books_liability_gl_cents=books["liability_by_code_cents"],
        subledger_liability_cents=sub["liability_by_code_cents"],
        bank_mapping_approved=True, statement_approved=True,
        books_gl_verified=True, subledger_verified=True,
        evidence_cutoffs={"bank":cutoff, "books":cutoff, "subledger":cutoff},
        outstanding_items_supported=True)
    return reconcile(e)
