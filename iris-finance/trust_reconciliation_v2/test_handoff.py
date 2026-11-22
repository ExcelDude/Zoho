import unittest
from copy import deepcopy
from handoff import HandoffError, summarize_preview_export, reconcile_verified_handoff
def preview():
    return {"schema_version":"iris-trust-preview-v1","organization_id":"110003520057",
     "pool":"RENT","cutoff":"2026-12-31","source_kind":"UNPOSTED_PREVIEW",
     "events":[{"event_key":"e1","bank_transaction_id":"bank-1","event_date":"2026-12-10",
         "amount_cents":250000,"allocation_total_cents":250000,"allocation_count":2,
         "manifest_fingerprint":"a"*64}],"unresolved_case_count":0}
def certified():
    return {"schema_version":"iris-certified-evidence-v1","organization_id":"110003520057",
      "pool":"RENT","cutoff":"2026-12-31","preview_source":None,
      "bank":{"rbc_bank_id":"RENT-RBC","books_bank_account_id":"RENT-BOOKS",
              "statement_cents":250000,"deposits_in_transit_cents":10000,
              "outstanding_payments_cents":10000,"cutoff":"2026-12-31",
              "statement_reference":"statement-id","timing_evidence_reference":"timing-detail-id"},
      "books":{"cash_gl_cents":250000,"liability_by_code_cents":{"2110":245000,"2115":5000},
              "cutoff":"2026-12-31","export_reference":"GL-signed"},
      "subledger":{"liability_by_code_cents":{"2110":245000,"2115":5000},
              "cutoff":"2026-12-31","posted_entries_only":True,
              "ledger_export_reference":"owner-and-suspense-ledger-signed"},
      "review":{"mapping_approved_by":"controller","bank_statement_approved_by":"controller",
                "books_gl_verified_by":"accountant","subledger_verified_by":"accountant",
                "independent_reviewed_by":"broker"}}
class HandoffTests(unittest.TestCase):
 def test_preview_never_certifies(self):
  s=summarize_preview_export(preview())
  self.assertEqual(s["status"],"INFORMATIONAL_PREVIEW_ONLY")
  self.assertFalse(s["subledger_verified"]);self.assertFalse(s["may_approve"])
  self.assertEqual(s["unposted_preview_cents"],250000)
 def test_doubled_preview(self):
  v=preview();v["events"].append(dict(v["events"][0]))
  with self.assertRaises(HandoffError): summarize_preview_export(v)
 def test_wrong_pool(self):
  v=preview();v["pool"]="DEPOSIT"
  with self.assertRaises(HandoffError):summarize_preview_export(v)
 def test_post_cutoff(self):
  v=preview();v["events"][0]["event_date"]="2027-01-01"
  with self.assertRaises(HandoffError):summarize_preview_export(v)
 def test_bad_allocation_sum(self):
  v=preview();v["events"][0]["allocation_total_cents"]-=1
  with self.assertRaises(HandoffError):summarize_preview_export(v)
 def test_bool_not_cents(self):
  v=preview();v["events"][0]["amount_cents"]=True
  with self.assertRaises(HandoffError):summarize_preview_export(v)
 def test_valid_attested_synthetic(self):
  result=reconcile_verified_handoff(certified())
  self.assertEqual(result.status,"RECONCILED")
 def test_preview_injection_rejected(self):
  v=certified();v["preview_source"]=preview()
  with self.assertRaisesRegex(HandoffError,"PREVIEW_DATA"):reconcile_verified_handoff(v)
 def test_unposted_ledger_rejected(self):
  v=certified();v["subledger"]["posted_entries_only"]=False
  with self.assertRaises(HandoffError):reconcile_verified_handoff(v)
 def test_bank_cutoff_rejected(self):
  v=certified();v["bank"]["cutoff"]="2026-12-30"
  with self.assertRaises(HandoffError):reconcile_verified_handoff(v)
 def test_missing_suspense_rejected(self):
  v=certified();del v["books"]["liability_by_code_cents"]["2115"]
  with self.assertRaises(HandoffError):reconcile_verified_handoff(v)
 def test_unverified_review_rejected(self):
  v=certified();v["review"]["independent_reviewed_by"]=""
  with self.assertRaises(HandoffError):reconcile_verified_handoff(v)
 def test_component_variance(self):
  v=certified();v["subledger"]["liability_by_code_cents"]={"2110":244999,"2115":5001}
  result=reconcile_verified_handoff(v)
  self.assertEqual(result.status,"VARIANCE")
  self.assertIn("COMPONENT_VARIANCE:2110",result.exceptions)
 def test_negative_outstanding(self):
  v=certified();v["bank"]["outstanding_payments_cents"]=-1
  self.assertEqual(reconcile_verified_handoff(v).status,"BLOCKED")
 def test_bank_and_books_not_guessed(self):
  v=certified();v["bank"]["rbc_bank_id"]=""
  with self.assertRaises(HandoffError):reconcile_verified_handoff(v)
if __name__=="__main__":unittest.main()
