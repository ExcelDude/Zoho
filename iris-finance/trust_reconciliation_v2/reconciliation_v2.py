"""Read-only Iris three-way trust reconciliation. All amounts integer CAD cents."""
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Mapping, Optional

class Pool(str, Enum):
    RENT = "RENT"
    DEPOSIT = "DEPOSIT"

ALLOWED_CODES = {
    Pool.RENT: frozenset(("2110","2115","2140","2160","2170")),
    Pool.DEPOSIT: frozenset(("2120","2125","2130","2135")),
}
REQUIRED_CODES = {
    Pool.RENT: frozenset(("2110","2115")),
    Pool.DEPOSIT: frozenset(("2120","2125","2130","2135")),
}

@dataclass(frozen=True)
class CutoffEvidence:
    pool: Pool
    cutoff: date
    bank_account_id: Optional[str]
    books_bank_account_id: Optional[str]
    bank_statement_cents: Optional[int]
    deposits_in_transit_cents: Optional[int]
    outstanding_payments_cents: Optional[int]
    books_cash_gl_cents: Optional[int]
    books_liability_gl_cents: Mapping[str, int]
    subledger_liability_cents: Mapping[str, int]
    bank_mapping_approved: bool = False
    statement_approved: bool = False
    books_gl_verified: bool = False
    subledger_verified: bool = False
    evidence_cutoffs: Mapping[str, date] = field(default_factory=dict)
    outstanding_items_supported: bool = False

@dataclass(frozen=True)
class Result:
    pool: Pool
    cutoff: date
    status: str
    adjusted_bank_cents: Optional[int]
    books_cash_gl_cents: Optional[int]
    liability_gl_total_cents: Optional[int]
    subledger_total_cents: Optional[int]
    differences_cents: Mapping[str, int]
    exceptions: tuple[str, ...]
    @property
    def may_approve(self):
        return self.status == "RECONCILED"

def _cents(v):
    return isinstance(v,int) and not isinstance(v,bool)

def reconcile(e: CutoffEvidence) -> Result:
    issues = []
    if e.pool not in ALLOWED_CODES:
        raise ValueError("Unsupported trust pool")
    if not e.bank_account_id or not e.books_bank_account_id or not e.bank_mapping_approved:
        issues.append("BANK_MAPPING_UNVERIFIED")
    if not e.statement_approved:
        issues.append("BANK_STATEMENT_UNVERIFIED")
    if not e.books_gl_verified:
        issues.append("BOOKS_GL_UNVERIFIED")
    if not e.subledger_verified:
        issues.append("SUBLEDGER_UNVERIFIED")
    if not e.outstanding_items_supported:
        issues.append("TIMING_ADJUSTMENTS_UNVERIFIED")
    for origin in ("bank","books","subledger"):
        if e.evidence_cutoffs.get(origin) != e.cutoff:
            issues.append("CUTOFF_"+origin.upper()+"_MISMATCH_OR_MISSING")
    amounts = (e.bank_statement_cents,e.deposits_in_transit_cents,e.outstanding_payments_cents,e.books_cash_gl_cents)
    if not all(_cents(v) for v in amounts):
        issues.append("MISSING_OR_NONINTEGER_CENTS")
    elif e.deposits_in_transit_cents < 0 or e.outstanding_payments_cents < 0:
        issues.append("NEGATIVE_TIMING_ADJUSTMENT")
    for label,items in (("GL",e.books_liability_gl_cents),("SUBLEDGER",e.subledger_liability_cents)):
        if not items:
            issues.append(label+"_COMPONENTS_MISSING")
        foreign=set(items)-ALLOWED_CODES[e.pool]
        if foreign:
            issues.append(label+"_FOREIGN_TRUST_CODES:"+",".join(sorted(foreign)))
        if not all(_cents(v) for v in items.values()):
            issues.append(label+"_NONINTEGER_CENTS")
        for code in sorted(REQUIRED_CODES[e.pool]-set(items)):
            issues.append(label+"_REQUIRED_COMPONENT_MISSING:"+code)
    if issues:
        cash=e.books_cash_gl_cents if _cents(e.books_cash_gl_cents) else None
        return Result(e.pool,e.cutoff,"BLOCKED",None,cash,None,None,{},tuple(issues))
    adjusted=e.bank_statement_cents+e.deposits_in_transit_cents-e.outstanding_payments_cents
    liability=sum(e.books_liability_gl_cents.values())
    subledger=sum(e.subledger_liability_cents.values())
    diff={"bank_minus_books":adjusted-e.books_cash_gl_cents,
          "books_minus_liability_gl":e.books_cash_gl_cents-liability,
          "liability_gl_minus_subledger":liability-subledger}
    if any(diff.values()):
        issues.append("THREE_WAY_VARIANCE")
    for code in sorted(set(e.books_liability_gl_cents)|set(e.subledger_liability_cents)):
        if e.books_liability_gl_cents.get(code,0)!=e.subledger_liability_cents.get(code,0):
            issues.append("COMPONENT_VARIANCE:"+code)
    return Result(e.pool,e.cutoff,"RECONCILED" if not issues else "VARIANCE",
                  adjusted,e.books_cash_gl_cents,liability,subledger,diff,tuple(issues))

def reconcile_both(rent: CutoffEvidence, deposit: CutoffEvidence):
    if rent.pool != Pool.RENT or deposit.pool != Pool.DEPOSIT:
        raise ValueError("Requires separate Rent and Deposit evidence")
    if rent.cutoff != deposit.cutoff:
        raise ValueError("Trust pools require common cutoff")
    if rent.bank_account_id and rent.bank_account_id==deposit.bank_account_id:
        raise ValueError("Trust pools cannot share RBC bank ID")
    if rent.books_bank_account_id and rent.books_bank_account_id==deposit.books_bank_account_id:
        raise ValueError("Trust pools cannot share Books bank ID")
    return reconcile(rent),reconcile(deposit)
