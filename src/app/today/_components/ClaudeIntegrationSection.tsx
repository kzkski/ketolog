"use client";

import {
  CLAUDE_INTEGRATION_ISSUE_BUTTON_LABEL,
  CLAUDE_INTEGRATION_REVOKE_CONFIRM,
  CLAUDE_INTEGRATION_SECTION_DESCRIPTION,
  CLAUDE_INTEGRATION_SECTION_TITLE,
  CLAUDE_INTEGRATION_SECURITY_HINT,
  CLAUDE_INTEGRATION_TOKEN_ONCE_HINT,
} from "@ketolog/domain/claude-integration";

import { useClaudeIntegration } from "../_hooks/useClaudeIntegration";

type Props = {
  enabled: boolean;
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return iso;
  }
}

export function ClaudeIntegrationSection({ enabled }: Props) {
  const {
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
  } = useClaudeIntegration(enabled);

  return (
    <div>
      <h3 className="text-sm font-medium text-white mb-1">{CLAUDE_INTEGRATION_SECTION_TITLE}</h3>
      <p className="text-xs text-gray-400 mb-2">{CLAUDE_INTEGRATION_SECTION_DESCRIPTION}</p>
      <p className="text-xs text-gray-500 mb-3">{CLAUDE_INTEGRATION_SECURITY_HINT}</p>

      {issueError && <p className="text-red-400 text-xs mb-2">{issueError}</p>}
      {revokeError && <p className="text-red-400 text-xs mb-2">{revokeError}</p>}

      <button
        type="button"
        onClick={() => void issueToken()}
        disabled={!enabled || issuing}
        className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
      >
        {issuing ? "発行中..." : CLAUDE_INTEGRATION_ISSUE_BUTTON_LABEL}
      </button>

      {listLoading && <p className="text-xs text-gray-500 mt-3">一覧を読み込み中...</p>}
      {listError && <p className="text-red-400 text-xs mt-3">{listError}</p>}

      {list && list.sessions.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-400">
            発行済み（{list.limits.active_count}/{list.limits.max_active} アクティブ）
          </p>
          <ul className="space-y-2">
            {list.sessions.map((session) => (
              <li
                key={session.id}
                className="rounded-xl border border-gray-700 bg-gray-800/40 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{session.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {formatDateTime(session.created_at)}
                    </p>
                    <p className="text-[11px] mt-1">
                      {session.status === "active" ? (
                        <span className="text-emerald-400">有効</span>
                      ) : (
                        <span className="text-gray-500">失効済み</span>
                      )}
                    </p>
                  </div>
                  {session.status === "active" && (
                    <button
                      type="button"
                      disabled={revokingId === session.id}
                      onClick={() => {
                        if (!window.confirm(CLAUDE_INTEGRATION_REVOKE_CONFIRM)) return;
                        void revokeSession(session.id);
                      }}
                      className="shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {revokingId === session.id ? "失効中..." : "失効"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issued && (
        <>
          <div className="fixed inset-0 bg-black/70 z-[60]" onClick={dismissIssued} />
          <div className="fixed inset-x-4 top-[10svh] z-[61] max-h-[80svh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-4 shadow-xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white">連携トークンを発行しました</h4>
              <button
                type="button"
                onClick={dismissIssued}
                className="text-gray-400 hover:text-white text-sm"
              >
                閉じる
              </button>
            </div>
            <p className="text-xs text-amber-200/90 mb-3">{CLAUDE_INTEGRATION_TOKEN_ONCE_HINT}</p>
            <label className="block text-[11px] text-gray-500 mb-1">refresh_token</label>
            <textarea
              readOnly
              value={issued.refresh_token}
              rows={4}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 text-xs text-gray-200 p-2 font-mono break-all"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void copyRefreshToken()}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-white mb-2">使い方</p>
              <pre className="text-[11px] text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                {issued.usage.steps_markdown}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
