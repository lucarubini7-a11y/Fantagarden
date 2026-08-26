import http.client
import json
import threading
import unittest

from advisor.ai_advisor import build_advisor_prompt, call_advisor
from advisor.server import create_server


class FakeTextBlock:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class FakeMessage:
    def __init__(self, text):
        self.content = [FakeTextBlock(text)]


class FakeMessagesEndpoint:
    def __init__(self, text=None, error=None):
        self._text = text
        self._error = error

    def create(self, **kwargs):
        if self._error:
            raise self._error
        return FakeMessage(self._text)


class FakeClient:
    """Mimics the small slice of the Anthropic SDK call_advisor actually uses."""

    def __init__(self, text=None, error=None):
        self.messages = FakeMessagesEndpoint(text, error)
        self.last_timeout = None

    def with_options(self, *, timeout=None):
        self.last_timeout = timeout
        return self


CONTEXT = {
    "player": {"nome": "Osimhen", "ruolo": "A", "squadra": "Napoli", "fvm": 80, "prezzo_max_consigliato": 55},
    "current_bid": 40,
    "my_team": {"budget_residuo": 200, "slot_rimasti_per_ruolo": {"A": 2}, "giocatori_gia_presi": ["Retegui"]},
    "other_teams": [
        {"nome_squadra": "Squadra 2", "budget_residuo": 150, "slot_rimasti_per_ruolo": {"A": 1}},
    ],
    "top_alternative_players": [{"nome": "Lucca", "fvm": 60}, {"nome": "Piccoli", "fvm": 45}],
}


class BuildAdvisorPromptTests(unittest.TestCase):
    def test_prompt_never_lists_opponent_rosters(self):
        context = {
            **CONTEXT,
            "other_teams": [
                {
                    "nome_squadra": "Squadra 2",
                    "budget_residuo": 150,
                    "slot_rimasti_per_ruolo": {"A": 1},
                    "giocatori_gia_presi": ["QuestoNonDeveApparire"],
                }
            ],
        }
        prompt = build_advisor_prompt(context)
        self.assertNotIn("QuestoNonDeveApparire", prompt)
        self.assertIn("solo aggregati", prompt.lower())

    def test_prompt_includes_player_and_alternatives(self):
        prompt = build_advisor_prompt(CONTEXT)
        self.assertIn("Osimhen", prompt)
        self.assertIn("Lucca", prompt)
        self.assertIn("italiano", prompt.lower())


class CallAdvisorTests(unittest.TestCase):
    def test_missing_api_key_returns_unavailable_without_raising(self):
        result = call_advisor(CONTEXT, client=None, model="claude-sonnet-4-6")
        self.assertEqual(result, {"available": False, "reason": "missing_api_key"})

    def test_client_error_returns_unavailable_without_raising(self):
        client = FakeClient(error=RuntimeError("boom"))
        result = call_advisor(CONTEXT, client=client)
        self.assertEqual(result["available"], False)
        self.assertEqual(result["reason"], "api_error")
        self.assertIn("boom", result["detail"])

    def test_successful_client_returns_advice_and_model(self):
        client = FakeClient(text=" Consigliato: buona occasione di mercato. ")
        result = call_advisor(CONTEXT, client=client, model="claude-sonnet-4-6")
        self.assertEqual(
            result,
            {"available": True, "advice": "Consigliato: buona occasione di mercato.", "model": "claude-sonnet-4-6"},
        )
        self.assertEqual(client.last_timeout, 8.0)

    def test_empty_response_is_treated_as_api_error(self):
        client = FakeClient(text="")
        result = call_advisor(CONTEXT, client=client)
        self.assertEqual(result["available"], False)
        self.assertEqual(result["reason"], "api_error")

    def test_injected_client_is_used_even_without_an_api_key_in_the_environment(self):
        client = FakeClient(text="Valuta con attenzione.")
        result = call_advisor(CONTEXT, client=client)
        self.assertTrue(result["available"])


class AdvisorLiveEndpointTests(unittest.TestCase):
    def setUp(self):
        self.received = []

        def fake_advisor(context):
            self.received.append(context)
            return {"available": True, "advice": "Consigliato.", "model": "claude-sonnet-4-6"}

        self.server = create_server(("127.0.0.1", 0), advisor=fake_advisor)
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

    def test_advisor_live_dispatches_to_the_injected_advisor_and_returns_200(self):
        body = json.dumps(CONTEXT).encode("utf-8")
        response, payload = self.request("POST", "/api/advisor-live", body, {"Content-Type": "application/json"})
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"available": True, "advice": "Consigliato.", "model": "claude-sonnet-4-6"})
        self.assertEqual(self.received[-1]["player"]["nome"], "Osimhen")

    def test_advisor_live_returns_200_even_when_unavailable(self):
        def unavailable_advisor(context):
            return {"available": False, "reason": "missing_api_key"}

        self.server.advisor = unavailable_advisor
        body = json.dumps(CONTEXT).encode("utf-8")
        response, payload = self.request("POST", "/api/advisor-live", body, {"Content-Type": "application/json"})
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"available": False, "reason": "missing_api_key"})


if __name__ == "__main__":
    unittest.main()
