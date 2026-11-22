"""Deposit preview validation and combined Rent/Deposit reconciliations (read-only)."""
from datetime import date
from collections.abc import Mapping
from handoff import HandoffError, reconcile_verified_handoff
from reconciliation_v2 import reconcile_both, Pool

def summarize_deposit_preview(payload):
    required={"schema_version","organization_id","pool","cutoff","source_kind",
              "events","unresolved_case_count","tenant_subledger_verified",
              "component_codes_verified","reconciliation_certified"}
    if not isinstance(payload,Mapping) or not required.issubset(payload):
        raise HandoffError("INVALID_DEPOSIT_PREVIEW")
    if (payload["schema_version"]!="iris-deposit-preview-v1" or
        payload["organization_id"]!="110003520057" or payload["pool"]!="DEPOSIT" or
        payload["source_kind"]!="UNPOSTED_PREVIEW"):
        raise HandoffError("INVALID_DEPOSIT_SOURCE")
    try:
        cutoff=date.fromisoformat(payload["cutoff"])
    except (ValueError,TypeError) as exc:
        raise HandoffError("INVALID_CUTOFF") from exc
    if cutoff.isoformat()!=payload["cutoff"]:
        raise HandoffError("INVALID_CUTOFF")
    if any(payload[k] is not False for k in ("tenant_subledger_verified",
              "component_codes_verified","reconciliation_certified")):
        raise HandoffError("DEPOSIT_PREVIEW_CANNOT_CERTIFY")
    if type(payload["unresolved_case_count"]) is not int or payload["unresolved_case_count"]<0:
        raise HandoffError("INVALID_EXCEPTION_COUNT")
    events=payload["events"]
    if not isinstance(events,list):
        raise HandoffError("INVALID_EVENTS")
    keys=set();total=0
    for v in events:
        required_event={"event_key","source_id","event_type","event_date","amount_cents",
                        "deposit_classification","posted_liability_cents"}
        if not isinstance(v,Mapping) or not required_event.issubset(v):
            raise HandoffError("INVALID_EVENT")
        if not v["event_key"] or not v["source_id"] or v["event_key"] in keys:
            raise HandoffError("DUPLICATE_OR_MISSING_EVENT")
        keys.add(v["event_key"])
        if v["event_type"] not in ("DEPOSIT_RECEIPT","DEPOSIT_REFUND","REVERSAL"):
            raise HandoffError("FOREIGN_DEPOSIT_TYPE")
        try:
            event_date=date.fromisoformat(v["event_date"])
        except (ValueError, TypeError) as exc:
            raise HandoffError("INVALID_EVENT_DATE") from exc
        if event_date>cutoff or event_date.isoformat()!=v["event_date"]:
            raise HandoffError("EVENT_AFTER_CUTOFF_OR_INVALID")
        if type(v["amount_cents"]) is not int or v["amount_cents"]<=0:
            raise HandoffError("INVALID_DEPOSIT_CENTS")
        if v["deposit_classification"]!="UNVERIFIED" or v["posted_liability_cents"] is not None:
            raise HandoffError("PREVIEW_IMPERSONATES_TENANT_LIABILITY")
        total+=v["amount_cents"]
    return {"status":"INFORMATIONAL_PREVIEW_ONLY","pool":"DEPOSIT","cutoff":cutoff.isoformat(),
            "event_count":len(events),"gross_unposted_preview_cents":total,
            "unresolved_case_count":payload["unresolved_case_count"],
            "tenant_liability_certified":False,"may_approve":False,"posting_allowed":False}

def combined_trust_report(rent_evidence,deposit_evidence):
    if rent_evidence.get("pool")!="RENT" or deposit_evidence.get("pool")!="DEPOSIT":
        raise HandoffError("TWO_DISTINCT_TRUST_POOLS_REQUIRED")
    rent=reconcile_verified_handoff(rent_evidence)
    deposit=reconcile_verified_handoff(deposit_evidence)
    # Guard shared bank mapping in the source attestations, not just arithmetic results.
    if (rent_evidence["bank"]["rbc_bank_id"]==deposit_evidence["bank"]["rbc_bank_id"] or
        rent_evidence["bank"]["books_bank_account_id"]==deposit_evidence["bank"]["books_bank_account_id"]):
        raise HandoffError("RENT_AND_DEPOSIT_BANK_MUST_BE_DISTINCT")
    if rent.cutoff!=deposit.cutoff:
        raise HandoffError("COMMON_CUTOFF_REQUIRED")
    return {"status":"SYNTHETIC_RECONCILIATION_REPORT_ONLY",
            "cutoff":rent.cutoff.isoformat(),"rent_status":rent.status,
            "deposit_status":deposit.status,
            "rent_exceptions":list(rent.exceptions),
            "deposit_exceptions":list(deposit.exceptions),
            "both_reconciled_arithmetic":rent.status=="RECONCILED" and deposit.status=="RECONCILED",
            "actual_source_authentication_verified":False,
            "financial_posting_allowed":False,"live_accountant_signoff":False}
