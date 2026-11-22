"""Synthetic adapter tests; no external account or bank access."""
import unittest
from dataclasses import replace
from datetime import date
from books_evidence_adapter import (
    ApprovedMapping,DatedBooksExport,EvidenceError,cents_decimal,
    inspect_mapping,collect_books_cutoff,build_unapproved_preview,explain_blocked_preview)
from reconciliation_v2 import Pool

D=date(2026,12,31)
BANK="bank-R"
L1="liability-R"
L2="suspense-R"
class FakeClient:
    def __init__(self):
        self.accounts=[
          {"account_id":BANK,"account_type":"bank","account_code":"","status":"active","account_name":"Current Account","current_balance":0},
          {"account_id":L1,"account_type":"other_current_liability","account_code":"2110","status":"active"},
          {"account_id":L2,"account_type":"other_current_liability","account_code":"2115","status":"active"},
          {"account_id":"bank-D","account_type":"bank","account_code":"","status":"active","account_name":"Current Account"}]
    def list_accounts(self): return self.accounts
    def get_account(self,aid): return next(a for a in self.accounts if a["account_id"]==aid)
def mapping():
    return ApprovedMapping(Pool.RENT,BANK,"RBC masked reference",{"2110":L1,"2115":L2},"Finance Reviewer","2026-11-21")
def export():
    return DatedBooksExport(D,{"BANK":"12300.00","2110":"11600.00","2115":"700.00"},
                            {"BANK":BANK,"2110":L1,"2115":L2},
                            "Accountant","GL-export-2026-12-31")
class AdapterTest(unittest.TestCase):
    def test_valid_structure(self): self.assertEqual(inspect_mapping(FakeClient(),mapping())["pool"],"RENT")
    def test_live_zero_never_used(self):
        e=build_unapproved_preview(FakeClient(),Pool.RENT,D)
        self.assertIsNone(e.books_cash_gl_cents)
        self.assertEqual(explain_blocked_preview(FakeClient(),Pool.RENT,D).status,"BLOCKED")
    def test_approved_dated_export(self):
        x=collect_books_cutoff(FakeClient(),mapping(),export(),D)
        self.assertEqual(x["bank_cents"],1230000)
        self.assertEqual(x["liability_cents"]["2115"],70000)
    def test_wrong_date(self):
        with self.assertRaises(EvidenceError): collect_books_cutoff(FakeClient(),mapping(),replace(export(),cutoff=date(2026,11,30)),D)
    def test_missing_bank_mapping(self):
        with self.assertRaises(EvidenceError): inspect_mapping(FakeClient(),replace(mapping(),approved_by=""))
    def test_no_name_based_matching(self):
        with self.assertRaises(EvidenceError): inspect_mapping(FakeClient(),replace(mapping(),books_bank_account_id="Current Account"))
    def test_mismatched_id(self):
        ex=replace(export(),account_ids={"BANK":"wrong","2110":L1,"2115":L2})
        with self.assertRaises(EvidenceError): collect_books_cutoff(FakeClient(),mapping(),ex,D)
    def test_missing_liability(self):
        with self.assertRaises(EvidenceError): inspect_mapping(FakeClient(),replace(mapping(),account_codes={"2110":L1}))
    def test_wrong_type(self):
        client=FakeClient(); client.accounts[1]["account_type"]="bank"
        with self.assertRaises(EvidenceError): inspect_mapping(client,mapping())
    def test_invalid_money_precision(self):
        for amount in ("1.234","NaN","",2.5):
            with self.subTest(amount=amount):
                with self.assertRaises(EvidenceError): cents_decimal(amount)
    def test_no_current_balance_substitution(self):
        c=FakeClient();c.accounts[0]["current_balance"]=99999
        self.assertIsNone(build_unapproved_preview(c,Pool.RENT,D).books_cash_gl_cents)
if __name__=="__main__": unittest.main()
