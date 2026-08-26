import http.client
import json
import threading
import unittest
from pathlib import Path

from advisor.player_status import fetch_player_status, get_player_status
from advisor.server import create_server


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class FakeHighlightlyClient:
    def __init__(self, by_team):
        self.by_team = by_team
        self.calls = []

    def get(self, url, *, params=None, headers=None):
        self.calls.append((url, params, headers))
        team = params["team"]
        return FakeResponse({"data": self.by_team.get(team, [])})


class FetchPlayerStatusHighlightlyTests(unittest.TestCase):
    def setUp(self):
        self.env = {}

    def test_missing_api_key_returns_empty_dict_without_raising(self):
        result = fetch_player_status(["Inter"], client=FakeHighlightlyClient({}), provider="highlightly")
        self.assertEqual(result, {})

    def test_client_error_returns_empty_dict_without_raising(self):
        import os

        os.environ["HIGHLIGHTLY_API_KEY"] = "test-key"
        try:
            class RaisingClient:
                def get(self, *args, **kwargs):
                    raise RuntimeError("boom")

            result = fetch_player_status(["Inter"], client=RaisingClient(), provider="highlightly")
            self.assertEqual(result, {})
        finally:
            del os.environ["HIGHLIGHTLY_API_KEY"]

    def test_successful_fetch_maps_reasons_to_statuses_and_calls_once_per_team(self):
        import os

        os.environ["HIGHLIGHTLY_API_KEY"] = "test-key"
        try:
            client = FakeHighlightlyClient(
                {
                    "Inter": [
                        {"player_name": "Lautaro", "reason": "Muscle injury", "updated_at": "2026-08-20"},
                        {"player_name": "Barella", "reason": "Suspended", "updated_at": "2026-08-19"},
                        {"player_name": "Dumfries", "reason": "Doubtful", "updated_at": "2026-08-21"},
                    ],
                    "Milan": [],
                },
            )
            result = fetch_player_status(["Inter", "Milan"], client=client, provider="highlightly")
            self.assertEqual(len(client.calls), 2)
            self.assertEqual(result["Lautaro"]["stato"], "infortunato")
            self.assertEqual(result["Barella"]["stato"], "diffidato")
            self.assertEqual(result["Dumfries"]["stato"], "in_dubbio")
            self.assertEqual(result["Lautaro"]["fonte"], "highlightly")
            self.assertEqual(result["Lautaro"]["squadra"], "Inter")
            self.assertNotIn("stato", {} if "Milan" not in result else result.get("Milan", {}))
        finally:
            del os.environ["HIGHLIGHTLY_API_KEY"]

    def test_unknown_provider_returns_empty_dict(self):
        result = fetch_player_status(["Inter"], client=FakeHighlightlyClient({}), provider="not-a-real-provider")
        self.assertEqual(result, {})


class FakeApiFootballClient:
    def __init__(self, *, covered, injuries_by_team_id):
        self.covered = covered
        self.injuries_by_team_id = injuries_by_team_id
        self.calls = []

    def get(self, url, *, params=None, headers=None):
        self.calls.append(url)
        if url.endswith("/leagues"):
            return FakeResponse(
                {"response": [{"seasons": [{"year": params["season"], "coverage": {"injuries": self.covered}}]}]}
            )
        if url.endswith("/injuries"):
            team_id = params["team"]
            return FakeResponse({"response": self.injuries_by_team_id.get(team_id, [])})
        raise AssertionError(f"unexpected url {url}")


class FetchPlayerStatusApiFootballTests(unittest.TestCase):
    def test_skips_injuries_call_when_season_is_not_covered(self):
        import os

        os.environ["API_FOOTBALL_API_KEY"] = "test-key"
        try:
            client = FakeApiFootballClient(covered=False, injuries_by_team_id={})
            result = fetch_player_status(
                ["Inter"], client=client, provider="api-football", season=2026, team_ids={"Inter": 505},
            )
            self.assertEqual(result, {})
            self.assertTrue(all(not url.endswith("/injuries") for url in client.calls))
        finally:
            del os.environ["API_FOOTBALL_API_KEY"]

    def test_fetches_injuries_when_season_is_covered(self):
        import os

        os.environ["API_FOOTBALL_API_KEY"] = "test-key"
        try:
            client = FakeApiFootballClient(
                covered=True,
                injuries_by_team_id={505: [{"player": {"name": "Thuram", "reason": "Knock"}}]},
            )
            result = fetch_player_status(
                ["Inter"], client=client, provider="api-football", season=2026, team_ids={"Inter": 505},
            )
            self.assertEqual(result["Thuram"]["stato"], "infortunato")
            self.assertEqual(result["Thuram"]["fonte"], "api-football")
        finally:
            del os.environ["API_FOOTBALL_API_KEY"]


class GetPlayerStatusCacheTests(unittest.TestCase):
    def setUp(self):
        import tempfile

        self.temp_dir = tempfile.TemporaryDirectory()
        self.cache_path = Path(self.temp_dir.name) / "player_status_cache.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_writes_and_reuses_a_fresh_cache_without_refetching(self):
        calls = []

        def fetcher(team_names, **kwargs):
            calls.append(team_names)
            return {"Player": {"stato": "infortunato"}}

        first = get_player_status(["Inter"], cache_path=self.cache_path, now=1000.0, fetch_fn=fetcher)
        self.assertEqual(first["players"], {"Player": {"stato": "infortunato"}})
        self.assertTrue(self.cache_path.exists())

        second = get_player_status(["Inter"], cache_path=self.cache_path, now=1000.0 + 60, fetch_fn=fetcher)
        self.assertEqual(second, first)
        self.assertEqual(len(calls), 1, "the fresh cache must not trigger a second fetch")

    def test_refetches_once_the_cache_is_older_than_six_hours(self):
        calls = []

        def fetcher(team_names, **kwargs):
            calls.append(team_names)
            return {"Player": {"stato": "diffidato"}}

        get_player_status(["Inter"], cache_path=self.cache_path, now=1000.0, fetch_fn=fetcher)
        six_hours_and_one_second = 1000.0 + 6 * 60 * 60 + 1
        refreshed = get_player_status(
            ["Inter"], cache_path=self.cache_path, now=six_hours_and_one_second, fetch_fn=fetcher,
        )
        self.assertEqual(len(calls), 2)
        self.assertEqual(refreshed["fetched_at"], six_hours_and_one_second)

    def test_force_refresh_bypasses_a_fresh_cache(self):
        calls = []

        def fetcher(team_names, **kwargs):
            calls.append(team_names)
            return {}

        get_player_status(["Inter"], cache_path=self.cache_path, now=1000.0, fetch_fn=fetcher)
        get_player_status(
            ["Inter"], cache_path=self.cache_path, now=1000.1, force_refresh=True, fetch_fn=fetcher,
        )
        self.assertEqual(len(calls), 2)

    def test_default_fetch_tries_highlightly_then_falls_back_to_api_football(self):
        import os

        os.environ["API_FOOTBALL_API_KEY"] = "test-key"
        try:
            client = FakeApiFootballClient(
                covered=True,
                injuries_by_team_id={505: [{"player": {"name": "Thuram", "reason": "Knock"}}]},
            )
            # No HIGHLIGHTLY_API_KEY is set, so fetch_player_status_with_fallback
            # must fall through to api-football without raising.
            result = get_player_status(
                ["Inter"],
                cache_path=self.cache_path,
                now=1000.0,
                client=client,
                season=2026,
                team_ids={"Inter": 505},
            )
            self.assertEqual(result["players"]["Thuram"]["fonte"], "api-football")
        finally:
            del os.environ["API_FOOTBALL_API_KEY"]

    def test_corrupt_cache_file_is_treated_as_missing_without_raising(self):
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text("{not json", encoding="utf-8")

        result = get_player_status(["Inter"], cache_path=self.cache_path, now=1000.0, client=object())
        self.assertEqual(result["players"], {})


class PlayerStatusEndpointTests(unittest.TestCase):
    def setUp(self):
        self.calls = []

        def fake_fetcher(*, force_refresh=False):
            self.calls.append(force_refresh)
            return {"fetched_at": 1000.0, "players": {"Lautaro": {"stato": "infortunato"}}}

        self.server = create_server(("127.0.0.1", 0), player_status_fetcher=fake_fetcher)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def request(self, path):
        connection = http.client.HTTPConnection(*self.server.server_address)
        connection.request("GET", path)
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response, json.loads(payload) if payload else None

    def test_player_status_dispatches_to_the_injected_fetcher_and_returns_200(self):
        response, payload = self.request("/api/player-status")
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["players"]["Lautaro"]["stato"], "infortunato")
        self.assertEqual(self.calls, [False])

    def test_player_status_forwards_the_refresh_query_parameter(self):
        response, _ = self.request("/api/player-status?refresh=1")
        self.assertEqual(response.status, 200)
        self.assertEqual(self.calls, [True])

    def test_player_status_returns_200_even_with_an_empty_cache(self):
        def empty_fetcher(*, force_refresh=False):
            return {"fetched_at": None, "players": {}}

        self.server.player_status_fetcher = empty_fetcher
        response, payload = self.request("/api/player-status")
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["players"], {})


if __name__ == "__main__":
    unittest.main()
