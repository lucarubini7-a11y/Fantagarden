import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "./auth.jsx";

function mockFetchOnce(response) {
  global.fetch = vi.fn().mockResolvedValue(response);
}

describe("AuthGate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("stays transparent (no password screen) when the backend never requires auth", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ valid: true }) });
    render(
      <AuthGate apiBase="http://api">
        <p>App content</p>
      </AuthGate>,
    );
    await waitFor(() => expect(screen.getByText("App content")).toBeInTheDocument());
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  test("shows the password screen when the backend requires auth and none is stored", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ valid: false }) });
    render(
      <AuthGate apiBase="http://api">
        <p>App content</p>
      </AuthGate>,
    );
    await waitFor(() => expect(screen.getByLabelText("Password")).toBeInTheDocument());
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
  });

  test("shows an error and does not unlock on a wrong password", async () => {
    const user = userEvent.setup();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: false }) });
    render(
      <AuthGate apiBase="http://api">
        <p>App content</p>
      </AuthGate>,
    );
    await waitFor(() => expect(screen.getByLabelText("Password")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /Entra/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Password errata"));
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
    expect(localStorage.getItem("fanta-app-password")).toBeNull();
  });

  test("unlocks and stores the password on a correct submit", async () => {
    const user = userEvent.setup();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) });
    render(
      <AuthGate apiBase="http://api">
        <p>App content</p>
      </AuthGate>,
    );
    await waitFor(() => expect(screen.getByLabelText("Password")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: /Entra/ }));

    await waitFor(() => expect(screen.getByText("App content")).toBeInTheDocument());
    expect(localStorage.getItem("fanta-app-password")).toBe("correct-horse");
  });
});
