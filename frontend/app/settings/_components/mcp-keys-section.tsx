"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface McpKey {
  id: string;
  name: string | null;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

interface CreatedMcpKey extends McpKey {
  key: string;
}

export function McpKeysSection() {
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<CreatedMcpKey | null>(null);
  const [confirming, setConfirming] = useState<McpKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = useCallback(async (): Promise<McpKey[]> => {
    const response = await fetch("/api/mcp-keys");
    if (!response.ok) throw new Error("Failed to load MCP keys");
    return response.json();
  }, []);

  const refreshKeys = useCallback(async () => {
    try {
      setKeys(await loadKeys());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MCP keys");
    }
  }, [loadKeys]);

  useEffect(() => {
    let cancelled = false;
    loadKeys()
      .then((loaded) => {
        if (!cancelled) setKeys(loaded);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load MCP keys");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadKeys]);

  const createKey = async () => {
    try {
      setCreating(true);
      const response = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: null }),
      });
      if (!response.ok) throw new Error("Failed to create MCP key");
      setRevealed(await response.json());
      await refreshKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create MCP key");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (key: McpKey) => {
    try {
      setRevoking(key.id);
      const response = await fetch(`/api/mcp-keys/${key.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to revoke MCP key");
      await refreshKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke MCP key");
    } finally {
      setRevoking(null);
      setConfirming(null);
    }
  };

  return (
    <section aria-label="MCP access" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4" aria-hidden />
            MCP access
          </h3>
          <p className="text-sm text-muted-foreground">
            Keys let an AI client search your Juddges corpus. A key is shown
            only once — store it in your client&apos;s configuration.
          </p>
        </div>
        <Button onClick={createKey} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Generate key
        </Button>
      </div>

      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" aria-hidden />
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading keys…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys yet.</p>
      ) : (
        <ul className="divide-y">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{key.prefix}…</p>
                <p className="text-xs text-muted-foreground">
                  {key.name ?? "Unnamed"} ·{" "}
                  {key.last_used_at ? `last used ${key.last_used_at}` : "never used"}
                </p>
              </div>
              {key.revoked_at ? (
                <Badge variant="secondary">Revoked</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke ${key.name ?? key.prefix}`}
                  disabled={revoking === key.id}
                  onClick={() => setConfirming(key)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={revealed !== null} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new MCP key</DialogTitle>
            <DialogDescription>
              This is shown only once. Copy it into your client now — it cannot
              be retrieved later.
            </DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded bg-muted p-3 font-mono text-sm">
            {revealed?.key}
          </code>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => revealed && navigator.clipboard?.writeText(revealed.key)}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Copy
            </Button>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this key?</DialogTitle>
            <DialogDescription>
              Any client using it stops working immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirming && revokeKey(confirming)}
              disabled={revoking !== null}
            >
              Confirm revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
