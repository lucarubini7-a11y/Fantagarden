import http.client
import json
import threading
import unittest

from advisor.server import create_server


class SharedPasswordAuthTests(unittest.TestCase):
    def setUp(self):
        self.server = create_server(("127.0.0.1", 0), shared_password="let-me-in")
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response, json.loads(payload) if payload else None

    def test_request_without_authorization_header_is_rejected(self):
        response, payload = self.request("GET", "/api/profiles")
        self.assertEqual(response.status, 401)
        self.assertEqual(payload, {"error": "unauthorized"})

    def test_request_with_wrong_password_is_rejected(self):
        response, payload = self.request(
            "GET", "/api/profiles", headers={"Authorization": "Bearer nope"}
        )
        self.assertEqual(response.status, 401)
        self.assertEqual(payload, {"error": "unauthorized"})

    def test_request_with_correct_password_reaches_the_normal_handler(self):
        response, payload = self.request(
            "GET", "/api/profiles", headers={"Authorization": "Bearer let-me-in"}
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"profiles": []})

    def test_put_and_post_are_also_gated(self):
        response, _ = self.request(
            "PUT", "/api/profiles/my-team", b"{}", {"Content-Type": "application/json"}
        )
        self.assertEqual(response.status, 401)

        response, _ = self.request(
            "POST", "/api/simulate", b"{}", {"Content-Type": "application/json"}
        )
        self.assertEqual(response.status, 401)

    def test_auth_check_endpoint_never_requires_the_header(self):
        response, payload = self.request(
            "POST",
            "/api/auth/check",
            json.dumps({"password": "let-me-in"}).encode("utf-8"),
            {"Content-Type": "application/json"},
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"valid": True})

        response, payload = self.request(
            "POST",
            "/api/auth/check",
            json.dumps({"password": "wrong"}).encode("utf-8"),
            {"Content-Type": "application/json"},
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"valid": False})


class NoSharedPasswordConfiguredTests(unittest.TestCase):
    """When APP_SHARED_PASSWORD isn't set, behavior must stay exactly as before."""

    def setUp(self):
        self.server = create_server(("127.0.0.1", 0))
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response, json.loads(payload) if payload else None

    def test_any_request_passes_without_a_header(self):
        response, payload = self.request("GET", "/api/profiles")
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"profiles": []})

    def test_auth_check_reports_valid_without_ever_requiring_a_password(self):
        response, payload = self.request(
            "POST",
            "/api/auth/check",
            json.dumps({}).encode("utf-8"),
            {"Content-Type": "application/json"},
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"valid": True})


if __name__ == "__main__":
    unittest.main()
