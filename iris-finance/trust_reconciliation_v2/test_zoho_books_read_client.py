import io
import json
import unittest
from urllib.error import URLError
from zoho_books_read_client import ZohoBooksReadClient
from books_evidence_adapter import EvidenceError

class Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self,*args): self.close()

class ClientTests(unittest.TestCase):
    def make_client(self,pages):
        calls=[]
        def opener(req,timeout):
            calls.append((req.get_method(),req.full_url,req.get_header("Authorization"),timeout))
            return Response(json.dumps(pages.pop(0)).encode())
        return ZohoBooksReadClient("110003520057","fake-test-token",opener=opener),calls

    def test_paginates_and_get_only(self):
        client,calls=self.make_client([
            {"code":0,"chartofaccounts":[{"account_id":"101","account_type":"bank"}],"page_context":{"has_more_page":True}},
            {"code":0,"chartofaccounts":[{"account_id":"102","account_type":"other_current_liability"}],"page_context":{"has_more_page":False}}
        ])
        self.assertEqual(len(client.list_accounts()),2)
        self.assertTrue(all(x[0]=="GET" for x in calls))
        self.assertTrue(all(x[1].startswith("https://www.zohoapis.ca/books/v3/chartofaccounts?") for x in calls))
        self.assertTrue(all("fake-test-token" not in x[1] for x in calls))
    def test_missing_pagination_fails_closed(self):
        client,_=self.make_client([{"code":0,"chartofaccounts":[]}])
        with self.assertRaises(EvidenceError): client.list_accounts()
    def test_duplicate_id_fails(self):
        client,_=self.make_client([{"code":0,"chartofaccounts":[{"account_id":"101"},{"account_id":"101"}],"page_context":{"has_more_page":False}}])
        with self.assertRaises(EvidenceError): client.list_accounts()
    def test_endpoint_denylist(self):
        client,_=self.make_client([])
        with self.assertRaises(EvidenceError): client._get("/invoices",{})
    def test_api_failure_sanitized(self):
        def bad(req,timeout): raise URLError("secret-stack-message")
        c=ZohoBooksReadClient("110003520057","fake-test-token",opener=bad)
        with self.assertRaises(EvidenceError) as x: c.list_accounts()
        self.assertNotIn("secret",str(x.exception))
    def test_get_account_id_validation(self):
        client,_=self.make_client([])
        with self.assertRaises(EvidenceError): client.get_account("../invoices")
    def test_get_account(self):
        client,calls=self.make_client([{"code":0,"chart_of_account":{"account_id":"101","account_type":"bank"}}])
        self.assertEqual(client.get_account("101")["account_id"],"101")
        self.assertIn("/chartofaccounts/101?",calls[0][1])
if __name__=="__main__": unittest.main()
