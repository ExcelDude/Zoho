import os, unittest, asyncio
from unittest.mock import AsyncMock, MagicMock, patch
os.environ["PROPRA_API_KEY"]="pn_SYNTHETIC_ONLY"
os.environ["PROPRA_API_SECRET"]="pz_SYNTHETIC_ONLY"
os.environ["MCP_ACCESS_TOKEN"]="SYNTHETIC_TEST_SECRET_ABCDEFGHIJKLMNOPQRSTUVWXYZ"
import server

class FakeClient:
    def __init__(self, result):self.result=result;self.calls=[]
    async def __aenter__(self):return self
    async def __aexit__(self,*a):return False
    async def get(self,url,**kwargs):
        self.calls.append((url,kwargs))
        return self.result

class TestReadOnlyMcp(unittest.TestCase):
 def test_resource_permissions(self):
    self.assertIn("owners",server.RESOURCES)
    self.assertNotIn("listings",server.RESOURCES)
    self.assertFalse(server.valid_id("../anything"))
    self.assertTrue(server.valid_id("aa-01_bc"))
    self.assertTrue(server.valid_client("https://chatgpt.com/oauth/client.json"))
    self.assertFalse(server.safe_redirect("https://evil.example/redirect"))
 def test_get_account_headers(self):
    result=MagicMock(status_code=200)
    result.json.return_value={"id":"TEST"}
    client=FakeClient(result)
    with patch.object(server.httpx,"AsyncClient",return_value=client):
        out=asyncio.run(server.upstream("/account"))
    self.assertEqual(out["id"],"TEST")
    self.assertEqual(len(client.calls),1)
    url,k=client.calls[0]
    self.assertEqual(url,"https://propra.app/api/v1/account")
    self.assertEqual(k["headers"]["x-api-key"],"pn_SYNTHETIC_ONLY")
    self.assertEqual(k["headers"]["Authorization"],"pz_SYNTHETIC_ONLY")
    self.assertFalse(k.get("follow_redirects",True) if "follow_redirects" in k else False)
 def test_forbidden_path_never_calls_network(self):
    with patch.object(server.httpx,"AsyncClient",side_effect=AssertionError("network called")):
        with self.assertRaisesRegex(ValueError,"allowlisted"):
            asyncio.run(server.upstream("/owners/../../admin"))
 def test_denial_hides_response_body(self):
    result=MagicMock(status_code=403,text="SYNTHETIC_PRIVATE_DATA")
    client=FakeClient(result)
    with patch.object(server.httpx,"AsyncClient",return_value=client):
        with self.assertRaisesRegex(ValueError,"HTTP 403") as cm:
            asyncio.run(server.upstream("/owners",{"first":1}))
    self.assertNotIn("SYNTHETIC_PRIVATE_DATA",str(cm.exception))
 def test_validated_paging(self):
    with self.assertRaisesRegex(ValueError,"1-20"):
        asyncio.run(server.list_propra_records("owners",first=30))
    with self.assertRaisesRegex(ValueError,"Resource not allowed"):
        asyncio.run(server.list_propra_records("listings"))
 def test_bad_id(self):
    with self.assertRaisesRegex(ValueError,"Invalid resource"):
        asyncio.run(server.get_propra_record("owners","../../../secret"))

if __name__=="__main__":unittest.main()
