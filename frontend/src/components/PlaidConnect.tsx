"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "@/lib/api";

export default function PlaidConnect({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ link_token: string }>("/plaid/link-token", { method: "POST" })
      .then((r) => setToken(r.link_token))
      .catch((e) => setError(e?.message ?? "Plaid not configured"));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      setError(null);
      try {
        await api("/plaid/exchange", {
          method: "POST",
          body: JSON.stringify({ public_token: publicToken }),
        });
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Connection failed");
      } finally {
        setBusy(false);
      }
    },
    [onConnected],
  );

  const { open, ready } = usePlaidLink({
    token: token ?? "",
    onSuccess: (publicToken) => onSuccess(publicToken),
  });

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={() => open()}
        disabled={!ready || !token || busy}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Connect via Plaid"}
      </button>
      {error && <span className="mt-1 text-xs text-bad">{error}</span>}
    </div>
  );
}
