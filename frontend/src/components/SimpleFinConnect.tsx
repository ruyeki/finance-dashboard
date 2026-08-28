"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ModuleHead } from "@/components/primitives";
import { Button, Input } from "@/components/dash/controls";

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
        `Connected. Imported ${r.sync.accounts} accounts and ${r.sync.added} transactions.`,
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
    <div>
      <ModuleHead
        title="Connect a bank (SimpleFIN)"
        subtitle={
          <>
            Get a setup token at{" "}
            <a
              href="https://beta-bridge.simplefin.org"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              beta-bridge.simplefin.org
            </a>{" "}
            — connect your banks there, create a token, and paste it below.
          </>
        }
      />
      <form onSubmit={connect} className="mt-4 flex gap-2">
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your SimpleFIN setup token"
        />
        <Button type="submit" variant="primary" disabled={busy || !token.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </form>
      {msg && <p className="mt-3 text-caption text-good">{msg}</p>}
      {error && <p className="mt-3 text-caption text-bad">{error}</p>}
    </div>
  );
}
