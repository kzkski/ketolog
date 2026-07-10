"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ClaudeIntegrationIssueResponseDto,
  ClaudeIntegrationSessionsListDto,
} from "@ketolog/types";

async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // ignore
  }
  return `リクエストに失敗しました (${res.status})`;
}

export function useClaudeIntegration(enabled: boolean) {
  const [list, setList] = useState<ClaudeIntegrationSessionsListDto | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<ClaudeIntegrationIssueResponseDto | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/claude-integration/sessions", { credentials: "include" });
      if (!res.ok) {
        setListError(await readApiError(res));
        return;
      }
      const data = (await res.json()) as ClaudeIntegrationSessionsListDto;
      setList(data);
    } catch {
      setListError("連携セッション一覧の取得に失敗しました");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refreshList();
  }, [enabled, refreshList]);

  const issueToken = useCallback(async () => {
    setIssuing(true);
    setIssueError(null);
    try {
      const res = await fetch("/api/claude-integration/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setIssueError(await readApiError(res));
        return;
      }
      const data = (await res.json()) as ClaudeIntegrationIssueResponseDto;
      setIssued(data);
      setCopied(false);
      await refreshList();
    } catch {
      setIssueError("連携トークンの発行に失敗しました");
    } finally {
      setIssuing(false);
    }
  }, [refreshList]);

  const revokeSession = useCallback(
    async (trackingId: string) => {
      setRevokingId(trackingId);
      setRevokeError(null);
      try {
        const res = await fetch(`/api/claude-integration/sessions/${trackingId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          setRevokeError(await readApiError(res));
          return;
        }
        await refreshList();
      } catch {
        setRevokeError("連携セッションの失効に失敗しました");
      } finally {
        setRevokingId(null);
      }
    },
    [refreshList]
  );

  const copyRefreshToken = useCallback(async () => {
    const token = issued?.refresh_token;
    if (!token) return false;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      return true;
    } catch {
      return false;
    }
  }, [issued?.refresh_token]);

  const dismissIssued = useCallback(() => {
    setIssued(null);
    setCopied(false);
  }, []);

  return {
    list,
    listLoading,
    listError,
    issuing,
    issueError,
    issued,
    revokingId,
    revokeError,
    copied,
    issueToken,
    revokeSession,
    copyRefreshToken,
    dismissIssued,
    refreshList,
  };
}
