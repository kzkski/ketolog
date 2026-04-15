"use client";

import Image from "next/image";
import Link from "next/link";
import type { AriaAttributes, ReactNode } from "react";
import type { DietPhase, PhaseProfiles } from "@/lib/diet-phase";
import type { PfcGrams } from "@/lib/pfc";
import { MACRO_BAR_BG } from "@/lib/macroHighlights";

function fmtMacroGrams(n: number) {
  return n < 10 ? n.toFixed(1) : Math.round(n).toString();
}

function PfcBarRow({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const pct = Math.min((current / target) * 100, 100);
  const over = current > target;
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <span className="text-xs text-gray-400 w-4 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 sm:h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${over ? "bg-red-500" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-xs tabular-nums w-[4.75rem] sm:w-[4.5rem] text-right ${over ? "text-red-400" : "text-gray-300"}`}
      >
        {fmtMacroGrams(current)} / {target}g
      </span>
    </div>
  );
}

export type PfcHeaderProps = {
  /** 日付ナビなど、ブランド行とフェーズ行のあいだに差し込む領域 */
  dateNav: ReactNode;
  dietPhases: readonly DietPhase[];
  phaseProfiles: PhaseProfiles;
  activeDietPhase: DietPhase;
  phaseQuickSaving: boolean;
  onSelectQuickPhase: (ph: DietPhase) => void;
  totalConsumed: PfcGrams;
  proteinTargetG: number;
  fatTargetG: number;
  carbsTargetG: number;
  centerMessage: string | null;
  centerIsAppUpdate: boolean;
  onCenterClick: () => void;
  centerTitle: string | undefined;
  centerAriaLabel: string;
  centerAriaHasPopup: AriaAttributes["aria-haspopup"];
  centerAriaExpanded: boolean | undefined;
  onOpenSettings: () => void;
  headerHint: string | null;
  hintDialogOpen: boolean;
  onCloseHintDialog: () => void;
  appUpdateDetail: string | null;
  appUpdateDialogOpen: boolean;
  onCloseAppUpdateDialog: () => void;
  appUpdateApplying: boolean;
  onApplyAppUpdate: () => void;
};

export function PfcHeader({
  dateNav,
  dietPhases,
  phaseProfiles,
  activeDietPhase,
  phaseQuickSaving,
  onSelectQuickPhase,
  totalConsumed,
  proteinTargetG,
  fatTargetG,
  carbsTargetG,
  centerMessage,
  centerIsAppUpdate,
  onCenterClick,
  centerTitle,
  centerAriaLabel,
  centerAriaHasPopup,
  centerAriaExpanded,
  onOpenSettings,
  headerHint,
  hintDialogOpen,
  onCloseHintDialog,
  appUpdateDetail,
  appUpdateDialogOpen,
  onCloseAppUpdateDialog,
  appUpdateApplying,
  onApplyAppUpdate,
}: PfcHeaderProps) {
  const changelogUrl = process.env.NEXT_PUBLIC_CHANGELOG_URL;
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;

  return (
    <>
      <header className="flex-none flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-3 border-b border-gray-800 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1.5 shrink-0 min-w-0 sm:gap-2">
          <Link
            href="/today"
            className="flex min-w-0 items-center gap-2 rounded-lg pr-0.5 touch-manipulation transition-colors active:bg-gray-800/50 sm:hover:bg-gray-900/40"
            aria-label="記録（今日）へ戻る"
          >
            <Image
              src="/icons/icon-header.png"
              alt=""
              width={160}
              height={160}
              className="h-10 w-10 shrink-0 rounded-full object-cover sm:h-11 sm:w-11"
              sizes="(max-width: 640px) 40px, 44px"
              priority
            />
            <span className="text-base font-bold text-white">Ketolog</span>
          </Link>
          {changelogUrl ? (
            <a
              href={changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="変更履歴（Changelog）を開く"
              className="shrink-0 text-xs font-normal text-gray-500 hover:text-gray-300 hover:underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              v{appVersion}
            </a>
          ) : (
            <span className="shrink-0 text-xs font-normal text-gray-500">v{appVersion}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex justify-center items-center px-1">
          {centerMessage ? (
            <button
              type="button"
              onClick={onCenterClick}
              className={`text-center text-[11px] leading-snug truncate max-w-full min-w-0 w-full rounded-md py-1 touch-manipulation transition-colors active:bg-gray-800/50 sm:hover:bg-gray-800/40 ${
                centerIsAppUpdate
                  ? "text-emerald-400/95 sm:hover:text-emerald-300"
                  : "text-gray-400"
              }`}
              title={centerTitle}
              aria-label={centerAriaLabel}
              aria-haspopup={centerAriaHasPopup}
              aria-expanded={centerAriaExpanded}
            >
              {centerMessage}
            </button>
          ) : null}
        </div>
        <button
          onClick={onOpenSettings}
          type="button"
          className="shrink-0 text-gray-400 hover:text-white transition-colors text-base sm:text-lg leading-none min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg sm:rounded-none active:bg-gray-800/60 sm:active:bg-transparent"
        >
          ⚙
        </button>
      </header>

      {dateNav}

      <div className="flex-none px-2 sm:px-4 py-1 sm:py-1.5 border-b border-gray-800 bg-gray-900">
        <div className="flex gap-1 sm:gap-2 justify-stretch">
          {dietPhases.map((ph) => {
            const pr = phaseProfiles[String(ph) as keyof PhaseProfiles];
            const on = activeDietPhase === ph;
            return (
              <button
                key={ph}
                type="button"
                disabled={phaseQuickSaving}
                onClick={() => void onSelectQuickPhase(ph)}
                title={pr.name}
                className={`flex-1 min-w-0 min-h-8 sm:min-h-9 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-medium transition-colors border touch-manipulation ${
                  on
                    ? "border-emerald-500 bg-emerald-950/50 text-emerald-100"
                    : "border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                } disabled:opacity-50`}
              >
                <span className="block truncate">{pr.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-none px-3 sm:px-4 py-1.5 sm:py-3 bg-gray-900 border-b border-gray-800 space-y-1 sm:space-y-1.5">
        <PfcBarRow
          label="P"
          current={totalConsumed.p}
          target={proteinTargetG}
          color={MACRO_BAR_BG.p}
        />
        <PfcBarRow
          label="F"
          current={totalConsumed.f}
          target={fatTargetG}
          color={MACRO_BAR_BG.f}
        />
        <PfcBarRow
          label="C"
          current={totalConsumed.c}
          target={carbsTargetG}
          color={MACRO_BAR_BG.c}
        />
      </div>

      {headerHint && hintDialogOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onCloseHintDialog}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="header-hint-dialog-title"
            className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto flex flex-col rounded-t-2xl border-x border-t border-gray-700 bg-gray-900 shadow-lg pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-600 rounded-full" />
            </div>
            <div className="px-4 pt-2 pb-3 space-y-3">
              <h2 id="header-hint-dialog-title" className="text-center text-sm font-semibold text-white">
                ヒント
              </h2>
              <p className="text-sm text-gray-300 whitespace-pre-wrap break-words max-h-[55svh] overflow-y-auto leading-relaxed">
                {headerHint}
              </p>
              <button
                type="button"
                onClick={onCloseHintDialog}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </>
      )}

      {appUpdateDetail && appUpdateDialogOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onCloseAppUpdateDialog}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-update-dialog-title"
            className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto flex flex-col rounded-t-2xl border-x border-t border-gray-700 bg-gray-900 shadow-lg pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-600 rounded-full" />
            </div>
            <div className="px-4 pt-2 pb-3 space-y-3">
              <h2 id="app-update-dialog-title" className="text-center text-sm font-semibold text-white">
                アップデート
              </h2>
              <p className="text-sm text-gray-300 whitespace-pre-wrap break-words max-h-[55svh] overflow-y-auto leading-relaxed">
                {appUpdateDetail}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCloseAppUpdateDialog}
                  disabled={appUpdateApplying}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  閉じる
                </button>
                <button
                  type="button"
                  onClick={onApplyAppUpdate}
                  disabled={appUpdateApplying}
                  className="touch-manipulation flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 disabled:bg-emerald-700/70 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {appUpdateApplying ? "更新中..." : "更新する"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
