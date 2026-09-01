"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, NetworkError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      router.push("/");
    } catch (err) {
      // A wrong password and an unreachable server both used to read "Login
      // failed", which sends you hunting for the wrong problem.
      if (err instanceof NetworkError) {
        setError(
          `Cannot reach the API at ${err.base}. Check the backend is running and that its address matches this page's.`,
        );
      } else if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "That password is not right."
            : `${err.message} (${err.status})`,
        );
      } else {
        setError("Login failed for an unknown reason.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-8 shadow-xl"
      >
        <h1 className="text-xl font-semibold">Finance Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Enter your password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="mt-6 w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
