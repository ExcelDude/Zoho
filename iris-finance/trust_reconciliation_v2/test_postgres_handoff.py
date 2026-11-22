"""Cross-language contract verification using JSON exported from disposable PostgreSQL."""
import json
import os
import unittest
from pathlib import Path
from handoff import summarize_preview_export, reconcile_verified_handoff, HandoffError
from test_handoff import certified
class PostgresToPythonTests(unittest.TestCase):
 def test_export_from_actual_disposable_postgres_cannot_certify(self):
  path=os.environ.get("IRIS_TEST_EXPORT_PATH")
  if not path or not Path(path).is_file():
   self.skipTest("Cross-language export file provided only by CI integration job")
  with open(path,encoding="utf8") as f:
   export=json.load(f)
  result=summarize_preview_export(export)
  self.assertGreaterEqual(result["receipt_count"],1)
  self.assertGreaterEqual(result["unposted_preview_cents"],250001)
  self.assertEqual(sum(e["amount_cents"] for e in export["events"]),result["unposted_preview_cents"])
  self.assertEqual(sum(e["bank_transaction_id"]=="txn-handoff" for e in export["events"]),1)
  self.assertFalse(result["subledger_verified"])
  self.assertFalse(result["may_approve"])
  attested=certified()
  attested["preview_source"]=export
  with self.assertRaisesRegex(HandoffError,"PREVIEW_DATA"):
   reconcile_verified_handoff(attested)
if __name__=="__main__":unittest.main()
