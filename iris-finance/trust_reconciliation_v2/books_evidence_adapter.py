"""Read-only Books evidence adapter. Never certifies a current_balance as a cutoff GL balance.

Use an injected read-only Books client for account inventory, then an independently
approved, dated GL export for historical balances. No HTTP credentials in this module.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Mapping, Protocol

from reconciliation_v2 import Pool, REQUIRED_CODES, CutoffEvidence, reconcile

class EvidenceError(ValueError):
    pass

class BooksClient(Protocol):
    def list_accounts(self) -> list[dict]: ...
    def get_account(self, account_id: str) -> dict: ...

@dataclass(frozen=True)
class ApprovedMapping:
    pool: Pool
    books_bank_account_id: str
    rbc_bank_reference: str
    account_codes: Mapping[str, str]
    approved_by: str
    approved_at: str

@dataclass(frozen=True)
class DatedBooksExport:
    cutoff: date
    account_balances: Mapping[str, str]
    account_ids: Mapping[str, str]
    verified_by: str
    export_reference: str

def cents_decimal(value: str) -> int:
    """Require a decimal-string amount with at most two decimal places."""
    if not isinstance(value, str) or not value.strip():
        raise EvidenceError("Balance is not a decimal string")
    try:
        n = Decimal(value)
    except InvalidOperation as exc:
        raise EvidenceError("Invalid money value") from exc
    if not n.is_finite() or n.as_tuple().exponent < -2:
        raise EvidenceError("Money must be finite and at most two decimals")
    return int(n * 100)

def _account_index(client: BooksClient):
    accounts = client.list_accounts()
    if not isinstance(accounts, list) or not accounts:
        raise EvidenceError("Books account inventory missing")
    result = {}
    for a in accounts:
        account_id = str(a.get("account_id",""))
        if account_id in result:
            raise EvidenceError("Duplicate Books account identifier")
        result[account_id] = a
    return result

def inspect_mapping(client: BooksClient, mapping: ApprovedMapping) -> dict:
    """Validate exact configured IDs. No account name matching or auto-selection."""
    if not mapping.approved_by or not mapping.approved_at or not mapping.rbc_bank_reference:
        raise EvidenceError("Bank mapping requires explicit approval and RBC reference")
    accounts = _account_index(client)
    bank = accounts.get(mapping.books_bank_account_id)
    if bank is None or bank.get("account_type") != "bank" or bank.get("status") != "active":
        raise EvidenceError("Configured Books bank ID absent/inactive/not a bank")
    required = REQUIRED_CODES[mapping.pool]
    if not required.issubset(mapping.account_codes):
        raise EvidenceError("Required liability account code not mapped")
    if len(set(mapping.account_codes.values())) != len(mapping.account_codes):
        raise EvidenceError("One Books GL account ID assigned to multiple liability codes")
    for code, aid in mapping.account_codes.items():
        a = accounts.get(aid)
        if a is None or a.get("account_code") != code or a.get("status") != "active":
            raise EvidenceError("Incorrect or inactive Books GL account ID: "+code)
        if a.get("account_type") != "other_current_liability":
            raise EvidenceError("Mapped Books liability account has wrong type: "+code)
    return {"pool":mapping.pool.value,
            "books_bank_account_id":mapping.books_bank_account_id,
            "rbc_bank_reference":mapping.rbc_bank_reference,
            "verified_liability_codes":tuple(sorted(mapping.account_codes)),
            "approved_by":mapping.approved_by,
            "note":"Account structure only; no cutoff balances certified"}

def collect_books_cutoff(client: BooksClient, mapping: ApprovedMapping,
                         gl_export: DatedBooksExport, cutoff: date):
    """Return a verified Books-only GL evidence slice, not a reconciliation."""
    inspect_mapping(client,mapping)
    if gl_export.cutoff != cutoff or not gl_export.verified_by or not gl_export.export_reference:
        raise EvidenceError("Approved dated Books export missing/wrong cutoff")
    wanted = {"BANK": mapping.books_bank_account_id, **dict(mapping.account_codes)}
    if not set(wanted).issubset(gl_export.account_balances):
        raise EvidenceError("GL export omits required account balance")
    if not set(wanted).issubset(gl_export.account_ids):
        raise EvidenceError("GL export omits account ID evidence")
    for code, aid in wanted.items():
        if gl_export.account_ids[code] != aid:
            raise EvidenceError("GL export account ID mismatch: "+code)
    return {
        "cutoff":cutoff,
        "bank_cents":cents_decimal(gl_export.account_balances["BANK"]),
        "liability_cents":{code:cents_decimal(gl_export.account_balances[code])
                           for code in mapping.account_codes},
        "export_reference":gl_export.export_reference,
        "verified_by":gl_export.verified_by,
    }

def build_unapproved_preview(client: BooksClient, pool: Pool, cutoff: date):
    """Fail-closed preview before Iris validates RBC-to-Books account mapping.

    This method deliberately does not import current balances or guessed IDs.
    """
    _account_index(client)  # live read health-check
    return CutoffEvidence(
        pool=pool,cutoff=cutoff,bank_account_id=None,books_bank_account_id=None,
        bank_statement_cents=None,deposits_in_transit_cents=None,
        outstanding_payments_cents=None,books_cash_gl_cents=None,
        books_liability_gl_cents={},subledger_liability_cents={},
        bank_mapping_approved=False,statement_approved=False,
        books_gl_verified=False,subledger_verified=False,
        evidence_cutoffs={},outstanding_items_supported=False
    )

def explain_blocked_preview(client: BooksClient, pool: Pool, cutoff: date):
    return reconcile(build_unapproved_preview(client,pool,cutoff))
