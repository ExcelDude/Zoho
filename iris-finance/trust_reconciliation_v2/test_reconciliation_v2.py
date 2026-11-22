import unittest
from dataclasses import replace
from datetime import date
from reconciliation_v2 import Pool, CutoffEvidence, reconcile, reconcile_both
D=date(2026,12,31)
def fixture(pool=Pool.RENT):
    if pool==Pool.RENT:
        items={"2110":1160000,"2115":70000}
        b,k="rent-rbc","rent-books"
    else:
        items={"2120":350000,"2125":120000,"2130":20000,"2135":25000}
        b,k="deposit-rbc","deposit-books"
    v=sum(items.values())
    return CutoffEvidence(pool,D,b,k,v-30000,50000,20000,v,items,items,
      True,True,True,True,{"bank":D,"books":D,"subledger":D},True)
class EngineTests(unittest.TestCase):
    def test_balanced_rent(self): self.assertTrue(reconcile(fixture()).may_approve)
    def test_balanced_deposit(self): self.assertTrue(reconcile(fixture(Pool.DEPOSIT)).may_approve)
    def test_variance(self): self.assertEqual(reconcile(replace(fixture(),books_cash_gl_cents=1230001)).status,"VARIANCE")
    def test_mapping_required(self): self.assertEqual(reconcile(replace(fixture(),bank_mapping_approved=False)).status,"BLOCKED")
    def test_statement_required(self): self.assertEqual(reconcile(replace(fixture(),statement_approved=False)).status,"BLOCKED")
    def test_missing_cash(self): self.assertEqual(reconcile(replace(fixture(),bank_statement_cents=None)).status,"BLOCKED")
    def test_cutoff_mismatch(self): self.assertEqual(reconcile(replace(fixture(),evidence_cutoffs={"bank":D})).status,"BLOCKED")
    def test_float_rejected(self): self.assertEqual(reconcile(replace(fixture(),books_cash_gl_cents=12300.0)).status,"BLOCKED")
    def test_timing_evidence_required(self): self.assertEqual(reconcile(replace(fixture(),outstanding_items_supported=False)).status,"BLOCKED")
    def test_negative_adjustment(self): self.assertEqual(reconcile(replace(fixture(),deposits_in_transit_cents=-1)).status,"BLOCKED")
    def test_foreign_codes(self):
        e=fixture(); t=dict(e.books_liability_gl_cents); t["2120"]=100
        self.assertIn("GL_FOREIGN_TRUST_CODES:2120",reconcile(replace(e,books_liability_gl_cents=t)).exceptions)
    def test_missing_suspense_not_zero(self):
        e=fixture();t={"2110":1160000}
        self.assertIn("GL_REQUIRED_COMPONENT_MISSING:2115",reconcile(replace(e,books_liability_gl_cents=t)).exceptions)
    def test_same_total_component_mismatch(self):
        e=fixture();t={"2110":1159999,"2115":70001}
        self.assertIn("COMPONENT_VARIANCE:2110",reconcile(replace(e,subledger_liability_cents=t)).exceptions)
    def test_distinct_pools(self):
        self.assertTrue(all(r.may_approve for r in reconcile_both(fixture(),fixture(Pool.DEPOSIT))))
    def test_shared_bank_forbidden(self):
        with self.assertRaises(ValueError):
            reconcile_both(fixture(),replace(fixture(Pool.DEPOSIT),bank_account_id="rent-rbc"))
    def test_unverified_subledger(self): self.assertEqual(reconcile(replace(fixture(),subledger_verified=False)).status,"BLOCKED")
if __name__=="__main__": unittest.main()
