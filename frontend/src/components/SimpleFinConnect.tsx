"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

export default function SimpleFinConnect({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await api<{ sync: { accounts: number; added: number } }>(
        "/simplefin/setup",
        { method: "POST", body: JSON.stringify({ setup_token: token.trim() }) },
      );
      setMsg(
        `Connected! Imported ${r.sync.accounts} accounts and ${r.sync.added} transactions.`,
      );
      setToken("");
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <h2 className="text-sm font-medium">Connect a bank (SimpleFIN)</h2>
      <p className="mt-1 text-xs text-muted">
        Get a setup token at{" "}
        <a
          href="https://beta-bridge.simplefin.org"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          beta-bridge.simplefin.org
        </a>{" "}
        (connect your banks there, then create a token), and paste it below.
      </p>
      <form onSubmit={connect} className="mt-3 flex gap-2">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your SimpleFIN setup token"
          className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          disabled={busy || !token.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>
      {msg && <p className="mt-2 text-xs text-good">{msg}</p>}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </Card>
  );
}
