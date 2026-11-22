import json
import os
import unittest
from copy import deepcopy
from pathlib import Path
from deposit_handoff import summarize_deposit_preview,combined_trust_report
from handoff import HandoffError
from test_handoff import certified

def sample():
 return {"schema_version":"iris-deposit-preview-v1","organization_id":"110003520057","pool":"DEPOSIT",
  "cutoff":"2026-12-31","source_kind":"UNPOSTED_PREVIEW",
  "tenant_subledger_verified":False,"component_codes_verified":False,
  "reconciliation_certified":False,"unresolved_case_count":0,
  "events":[{"event_key":"one","source_id":"bank1","event_type":"DEPOSIT_RECEIPT",
     "event_date":"2026-12-10","amount_cents":45000,
     "deposit_classification":"UNVERIFIED","posted_liability_cents":None}]}
def deposit_certified():
 d=certified()
 d["pool"]="DEPOSIT"
 d["bank"]["rbc_bank_id"]="deposit-rbc"
 d["bank"]["books_bank_account_id"]="deposit-books"
 d["books"]["liability_by_code_cents"]={"2120":300000,"2125":150000,"2130":20000,"2135":30000}
 d["subledger"]["liability_by_code_cents"]=dict(d["books"]["liability_by_code_cents"])
 d["books"]["cash_gl_cents"]=500000
 d["bank"]["statement_cents"]=500000
 d["bank"]["deposits_in_transit_cents"]=0
 d["bank"]["outstanding_payments_cents"]=0
 return d
class DepositHandoffTests(unittest.TestCase):
 def test_preview_never_certifies(self):
  report=summarize_deposit_preview(sample())
  self.assertEqual(report["status"],"INFORMATIONAL_PREVIEW_ONLY")
  self.assertFalse(report["tenant_liability_certified"])
  self.assertEqual(report["gross_unposted_preview_cents"],45000)
 def test_false_claim_of_posted_liability(self):
  d=sample();d["events"][0]["posted_liability_cents"]=45000
  with self.assertRaises(HandoffError):summarize_deposit_preview(d)
 def test_false_verification_flag(self):
  d=sample();d["tenant_subledger_verified"]=True
  with self.assertRaises(HandoffError):summarize_deposit_preview(d)
 def test_duplicate_deposit(self):
  d=sample();d["events"].append(dict(d["events"][0]))
  with self.assertRaises(HandoffError):summarize_deposit_preview(d)
 def test_cutoff(self):
  d=sample();d["events"][0]["event_date"]="2027-01-01"
  with self.assertRaises(HandoffError):summarize_deposit_preview(d)
 def test_synthetic_two_pool_arithmetic(self):
  r=combined_trust_report(certified(),deposit_certified())
  self.assertTrue(r["both_reconciled_arithmetic"])
  self.assertFalse(r["live_accountant_signoff"])
  self.assertFalse(r["financial_posting_allowed"])
 def test_banks_must_differ(self):
  d=deposit_certified();d["bank"]["rbc_bank_id"]="RENT-RBC"
  with self.assertRaises(HandoffError):combined_trust_report(certified(),d)
 def test_books_must_differ(self):
  d=deposit_certified();d["bank"]["books_bank_account_id"]="RENT-BOOKS"
  with self.assertRaises(HandoffError):combined_trust_report(certified(),d)
 def test_common_cutoff(self):
  d=deposit_certified();d["cutoff"]="2026-12-30"
  d["bank"]["cutoff"]=d["books"]["cutoff"]=d["subledger"]["cutoff"]="2026-12-30"
  with self.assertRaises(HandoffError):combined_trust_report(certified(),d)
 def test_deposit_component_variance(self):
  d=deposit_certified();d["subledger"]["liability_by_code_cents"]["2120"]-=1
  self.assertEqual(combined_trust_report(certified(),d)["deposit_status"],"VARIANCE")
 def test_actual_postgres_export(self):
  path=os.environ.get("IRIS_TEST_DEPOSIT_EXPORT_PATH")
  if not path or not Path(path).exists():
   self.skipTest("Only run with disposable PostgreSQL export")
  with open(path,encoding="utf8") as f:data=json.load(f)
  result=summarize_deposit_preview(data)
  self.assertFalse(result["may_approve"])
  self.assertEqual(result["event_count"],1)
if __name__=="__main__":unittest.main()
