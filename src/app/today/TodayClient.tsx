"use client";

import Image from "next/image";
import { useState, useMemo, useRef, useId, useEffect, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  FoodLogEntry,
  MenuItem,
  Restaurant,
  UserSettings,
  TodayConsumed,
  FavoriteGroupPayload,
} from "@/types/database";
import type { MealType } from "@/lib/meal-timezone";
import { isSnapshotRestaurant } from "@/lib/snapshot-restaurant";
import { createClient } from "@/lib/supabase/client";
import {
  saveMealToLog,
  updateMenuItem,
  addMenuItem,
  deleteMenuItem,
  addMenuItemToFavorites,
  removeMenuItemFromFavorites,
  addRestaurant,
  deleteRestaurant,
  reorderRestaurants,
  importRestaurantData,
  importMenuItemsToRestaurant,
  getFoodLogForDate,
  deleteFoodLogEntry,
  updateFoodLogEntry,
  updateUserSettings,
  lookupSharedProductByBarcode,
  type MenuItemUpdate,
  type ImportRestaurantItem,
  type SaveItem,
} from "./actions";
import type { SharedProduct } from "@/types/database";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  MACRO_BAR_BG,
  MACRO_MENU_TEXT,
  menuRowMacroHighlights,
  type MacroHighlightTargets,
} from "@/lib/macroHighlights";
import { computeHeaderHintText, getActiveHintSlot } from "@/lib/header-hint";
import { STANDARD_FOOD_TAB_TITLE } from "@/lib/standard-food-groups";
import { StandardFoodPanel } from "./StandardFoodPanel";
import { MenuGroupCollapseSession } from "./MenuGroupCollapseSession";

// ─── 型 ────────────────────────────────────────────────────────────────────────

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

const MEAL_TAB_STYLES: Record<MealType, { row: string; label: string }> = {
  breakfast: {
    row: "border-rose-400 bg-rose-400/10",
    label: "text-rose-300",
  },
  lunch: {
    row: "border-cyan-400 bg-cyan-400/10",
    label: "text-cyan-300",
  },
  dinner: {
    row: "border-violet-400 bg-violet-400/10",
    label: "text-violet-300",
  },
  snack: {
    row: "border-teal-400 bg-teal-400/10",
    label: "text-teal-300",
  },
};

/** カート内「記録する食事」セグメントの選択中スタイル（タブと同色） */
const MEAL_CART_SEGMENT_ACTIVE: Record<MealType, string> = {
  breakfast: "border-rose-400 bg-rose-500/25 text-rose-100",
  lunch: "border-cyan-400 bg-cyan-500/25 text-cyan-100",
  dinner: "border-violet-400 bg-violet-500/25 text-violet-100",
  snack: "border-teal-400 bg-teal-500/25 text-teal-100",
};

/** カートパネル外枠（選択中の食事タブと同系色の上線＋淡いグラデーション） */
const MEAL_CART_SHELL: Record<MealType, string> = {
  breakfast:
    "border-t-2 border-rose-400 bg-gradient-to-b from-rose-500/20 via-gray-900 to-gray-950",
  lunch:
    "border-t-2 border-cyan-400 bg-gradient-to-b from-cyan-500/20 via-gray-900 to-gray-950",
  dinner:
    "border-t-2 border-violet-400 bg-gradient-to-b from-violet-500/20 via-gray-900 to-gray-950",
  snack:
    "border-t-2 border-teal-400 bg-gradient-to-b from-teal-500/20 via-gray-900 to-gray-950",
};

/** レストランタブではない「お気に入り」集約ビュー */
const FAVORITES_TAB_ID = "__ketolog_favorites__";

/** 文科省標準成分表検索パネル（仮想タブ） */
const MEXT_COMPOSITION_TAB_ID = "__ketolog_mext_std__";

const RANK_OPTIONS = [
  { value: 1, label: "◎ 最優先" },
  { value: 2, label: "○ 通常" },
  { value: 3, label: "△ 控えめ" },
  { value: 4, label: "✕ 避ける" },
];

const CATEGORY_OPTIONS = [
  { value: "external",    label: "外食" },
  { value: "homemade",   label: "自炊" },
  { value: "convenience", label: "コンビニ" },
  { value: "other",      label: "その他" },
];

type CartEntry =
  | { kind: "menu"; item: MenuItem; count: number; gramsPerServing: number }
  | {
      kind: "snapshot";
      cartKey: string;
      name: string;
      protein_per_100g: number | null;
      fat_per_100g: number | null;
      carbs_per_100g: number | null;
      gramsPerServing: number;
      count: number;
      shared_barcode: string | null;
    };
type NutrientMode = "per100g" | "perServing";

type StandardFoodDraft = {
  food_code: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
};

// ドロワーの種別
type ItemDrawerState =
  | { kind: "edit"; item: MenuItem }
  | {
      kind: "add";
      restaurantId: string;
      /** ドロワー再マウント用（同一お店への連続追加でもフォームをリセットする） */
      openedAt: number;
      logMealType?: MealType;
      standardFoodDraft?: StandardFoodDraft;
    };

const HEADER_HINT_DEBOUNCE_MS = 300;

// ─── ユーティリティ ────────────────────────────────────────────────────────────

function firstTabRestaurantId(restaurants: Restaurant[]): string {
  const visible = restaurants.filter((r) => !isSnapshotRestaurant(r));
  return visible[0]?.id ?? "";
}

function pfcFromPer100(
  proteinPer100: number | null,
  fatPer100: number | null,
  carbsPer100: number | null,
  grams: number
) {
  return {
    p: ((proteinPer100 ?? 0) * grams) / 100,
    f: ((fatPer100 ?? 0) * grams) / 100,
    c: ((carbsPer100 ?? 0) * grams) / 100,
  };
}

function pfc(item: MenuItem, grams: number) {
  return {
    p: (item.protein_per_100g ?? 0) * grams / 100,
    f: (item.fat_per_100g ?? 0) * grams / 100,
    c: (item.carbs_per_100g ?? 0) * grams / 100,
  };
}

function fmt(n: number) {
  return n < 10 ? n.toFixed(1) : Math.round(n).toString();
}

function CartBarHeader({
  cartExpanded,
  onToggle,
  cartEntryCount,
  cartPFC,
  mealType,
}: {
  cartExpanded: boolean;
  onToggle: () => void;
  cartEntryCount: number;
  cartPFC: { p: number; f: number; c: number };
  mealType: MealType;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-4 py-3.5 sm:py-2.5 min-h-12 sm:min-h-0 text-left"
    >
      <div className="flex flex-col items-start min-w-0 flex-1 gap-0.5">
        <span className="text-base sm:text-sm font-medium text-white">
          カート（{cartEntryCount}品）
        </span>
        <span
          className={`text-[11px] sm:text-xs leading-snug ${MEAL_TAB_STYLES[mealType].label}`}
        >
          {MEAL_LABELS[mealType]}に記録
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm sm:text-xs text-gray-400 tabular-nums">
          P{fmt(cartPFC.p)} F{fmt(cartPFC.f)} C{fmt(cartPFC.c)}
        </span>
        <span className="text-gray-400 text-sm sm:text-xs" aria-hidden>
          {cartExpanded ? "▼" : "▲"}
        </span>
      </div>
    </button>
  );
}

function CartExpandedBody({
  mealType,
  setMealType,
  cartEntries,
  cartPFC,
  removeCartLine,
  onSave,
  saving,
  layout = "inline",
}: {
  mealType: MealType;
  setMealType: (t: MealType) => void;
  cartEntries: CartEntry[];
  cartPFC: { p: number; f: number; c: number };
  removeCartLine: (key: string) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  /** モバイルのオーバーレイでは一覧を縦に伸ばす */
  layout?: "inline" | "sheet";
}) {
  const listScrollClass =
    layout === "sheet"
      ? "min-h-0 flex-1 overflow-y-auto border-t border-gray-800/70"
      : "max-h-36 overflow-y-auto border-t border-gray-800/70";
  return (
    <>
      <div className="px-3 pt-1 pb-2 border-t border-gray-800/70">
        <p className="text-[10px] text-gray-500 mb-1.5 px-0.5">記録する食事</p>
        <div className="flex gap-1">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMealType(t)}
              className={`flex-1 min-h-10 min-w-0 px-0.5 py-2 rounded-lg text-[10px] sm:text-xs font-medium border-2 transition-colors touch-manipulation ${
                mealType === t
                  ? MEAL_CART_SEGMENT_ACTIVE[t]
                  : "border-gray-700/90 bg-gray-800/70 text-gray-500 hover:text-gray-300 hover:border-gray-600"
              }`}
            >
              {MEAL_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className={listScrollClass}>
        {cartEntries.map((entry) => {
          const totalGrams = entry.gramsPerServing * entry.count;
          const v =
            entry.kind === "menu"
              ? pfc(entry.item, totalGrams)
              : pfcFromPer100(
                  entry.protein_per_100g,
                  entry.fat_per_100g,
                  entry.carbs_per_100g,
                  totalGrams
                );
          const lineKey = entry.kind === "menu" ? entry.item.id : entry.cartKey;
          const title = entry.kind === "menu" ? entry.item.name : entry.name;
          const snapshotTag =
            entry.kind === "snapshot" ? (
              <span className="text-gray-600 ml-1 text-[10px] shrink-0">
                スナップショット
              </span>
            ) : null;
          return (
            <div
              key={lineKey}
              className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-800/50"
            >
              <span className="text-sm text-gray-200 truncate flex-1 min-w-0">
                {title}
                {snapshotTag}
                <span className="text-gray-500 ml-1 text-xs whitespace-nowrap">
                  ×{entry.count}（{totalGrams}g）
                </span>
              </span>
              <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                P{fmt(v.p)} F{fmt(v.f)} C{fmt(v.c)}
              </span>
              <button
                type="button"
                aria-label="カートから外す"
                onClick={() => removeCartLine(lineKey)}
                className="shrink-0 min-w-9 min-h-9 sm:min-w-8 sm:min-h-8 flex items-center justify-center text-gray-500 hover:text-white text-lg leading-none touch-manipulation rounded-lg active:bg-gray-800/60"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-3.5 sm:py-3 flex items-center justify-between gap-3 flex-none border-t border-gray-800/70">
        <div className="text-base sm:text-sm text-gray-300 tabular-nums min-w-0">
          合計 P<span className="text-white font-medium">{fmt(cartPFC.p)}</span>{" "}
          F<span className="text-white font-medium">{fmt(cartPFC.f)}</span>{" "}
          C<span className="text-white font-medium">{fmt(cartPFC.c)}</span>g
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="px-5 py-3 sm:px-4 sm:py-2 min-h-11 sm:min-h-0 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-base sm:text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          {saving ? "記録中..." : "記録する"}
        </button>
      </div>
    </>
  );
}

function sortRestaurants(list: Restaurant[]): Restaurant[] {
  return [...list].sort((a, b) => {
    const ao = a.display_order ?? 0;
    const bo = b.display_order ?? 0;
    if (ao !== bo) return ao - bo;
    return b.order_count - a.order_count;
  });
}

function to100g(val: string, gramsStr: string): string {
  const v = parseFloat(val), g = parseFloat(gramsStr);
  if (isNaN(v) || isNaN(g) || g === 0) return val;
  return parseFloat((v * 100 / g).toFixed(2)).toString();
}

function toServing(val: string, gramsStr: string): string {
  const v = parseFloat(val), g = parseFloat(gramsStr);
  if (isNaN(v) || isNaN(g)) return val;
  return parseFloat((v * g / 100).toFixed(2)).toString();
}

// ─── PFCバー ──────────────────────────────────────────────────────────────────

function PFCBar({ label, current, target, color }: {
  label: string; current: number; target: number; color: string;
}) {
  const pct = Math.min((current / target) * 100, 100);
  const over = current > target;
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <span className="text-xs text-gray-400 w-4 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 sm:h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${over ? "bg-red-500" : color}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums w-[4.75rem] sm:w-[4.5rem] text-right ${over ? "text-red-400" : "text-gray-300"}`}>
        {fmt(current)} / {target}g
      </span>
    </div>
  );
}

// ─── メニューアイテム追加・編集ドロワー ────────────────────────────────────────

function MenuItemDrawer({
  state,
  existingGroupNames,
  onClose,
  onSaved,
  onDeleted,
  mealTypeForLog,
  logDate,
  snapshotRestaurantId,
  onAfterSnapshotLog,
  onSnapshotCart,
  registerTargetRestaurantName,
  onOpenStandardFoodSearch,
}: {
  state: ItemDrawerState;
  existingGroupNames: string[];
  onClose: () => void;
  onSaved: (item: MenuItem) => void;
  onDeleted?: (id: string) => void;
  mealTypeForLog: MealType;
  logDate: string;
  snapshotRestaurantId: string;
  /** 追加時: いま選ばれているお店タブ（メニュー登録の宛先） */
  registerTargetRestaurantName: string;
  onAfterSnapshotLog: () => Promise<void>;
  onSnapshotCart: (draft: {
    name: string;
    protein_per_100g: number | null;
    fat_per_100g: number | null;
    carbs_per_100g: number | null;
    grams: number;
    shared_barcode: string | null;
  }) => void;
  onOpenStandardFoodSearch?: () => void;
}) {
  const groupListId = useId();
  const isEdit = state.kind === "edit";
  const existing = isEdit ? state.item : null;
  const draft = state.kind === "add" ? state.standardFoodDraft : undefined;

  const [name, setName]       = useState(() =>
    draft ? draft.name : (existing?.name ?? "")
  );
  const [protein, setProtein] = useState(() =>
    draft
      ? draft.protein_per_100g?.toString() ?? ""
      : (existing?.protein_per_100g?.toString() ?? "")
  );
  const [fat, setFat]         = useState(() =>
    draft
      ? draft.fat_per_100g?.toString() ?? ""
      : (existing?.fat_per_100g?.toString() ?? "")
  );
  const [carbs, setCarbs]     = useState(() =>
    draft
      ? draft.carbs_per_100g?.toString() ?? ""
      : (existing?.carbs_per_100g?.toString() ?? "")
  );
  const [grams, setGrams]     = useState(existing?.default_grams?.toString() ?? "100");
  const [rank, setRank]           = useState(existing?.rank ?? 2);
  const [groupName, setGroupName] = useState(existing?.group_name ?? "");
  const [notes, setNotes]         = useState(() =>
    draft && !existing
      ? "文科省標準成分表（利用可能炭水化物・質量計）"
      : (existing?.notes ?? "")
  );
  const [mode, setMode]       = useState<NutrientMode>("per100g");
  const [rawP, setRawP]       = useState<string | null>(null);
  const [rawF, setRawF]       = useState<string | null>(null);
  const [rawC, setRawC]       = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [sharedBarcode, setSharedBarcode] = useState(
    () => (draft ? null : (existing?.shared_barcode ?? null))
  );
  const [standardFoodCode, setStandardFoodCode] = useState<string | null>(() =>
    draft ? draft.food_code : (existing?.standard_food_code ?? null)
  );
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraResult, setCameraResult] = useState<SharedProduct | null>(null);
  const [lastLookup, setLastLookup] = useState<{ barcode: string; at: number } | null>(null);
  const [servingHint, setServingHint] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cameraSupported =
    typeof window !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    (typeof window.isSecureContext === "undefined" || window.isSecureContext);

  const displayP = mode === "per100g" ? protein : toServing(protein, grams);
  const displayF = mode === "per100g" ? fat     : toServing(fat,     grams);
  const displayC = mode === "per100g" ? carbs   : toServing(carbs,   grams);

  function handleModeChange(m: NutrientMode) {
    setRawP(null); setRawF(null); setRawC(null);
    setMode(m);
  }

  function commitNutrient(field: "p" | "f" | "c", raw: string | null) {
    if (raw === null) return;
    const stored = mode === "per100g" ? raw : to100g(raw, grams);
    if (field === "p") { setProtein(stored); setRawP(null); }
    if (field === "f") { setFat(stored);     setRawF(null); }
    if (field === "c") { setCarbs(stored);   setRawC(null); }
  }

  const handleLookupBarcode = useCallback(async (rawBarcode: string) => {
    const normalized = rawBarcode.replace(/[^\d]/g, "");
    if (!normalized) {
      setScanError("バーコードを読み取れませんでした。もう一度お試しください。");
      return;
    }
    if (lastLookup?.barcode === normalized && Date.now() - lastLookup.at < 3000) return;

    setScanLoading(true);
    setScanError(null);
    setLastLookup({ barcode: normalized, at: Date.now() });
    const res = await lookupSharedProductByBarcode(normalized);
    setScanLoading(false);
    if (res.status === "error" || !res.product) {
      setScanError(res.error ?? "OFFで商品が見つかりませんでした");
      return;
    }
    setCameraResult(res.product);
    setSharedBarcode(res.product.barcode);
    setStandardFoodCode(null);
    setName(res.product.product_name);
    setProtein(res.product.protein_per_100g?.toString() ?? "");
    setFat(res.product.fat_per_100g?.toString() ?? "");
    setCarbs(res.product.carbs_per_100g?.toString() ?? "");
    if (res.product.serving_size_grams && res.product.serving_size_grams > 0) {
      setGrams(res.product.serving_size_grams.toString());
      setServingHint(`OFFの serving_size (${res.product.serving_size}) を1回量に仮入力しました。ラベルで必ず確認してください。`);
    } else if (res.product.serving_size) {
      setServingHint(`OFFの serving_size (${res.product.serving_size}) を取得しました。1回量(g)を手動で確認してください。`);
    } else {
      setServingHint(null);
    }
    if (!notes.trim()) {
      setNotes(res.product.brand ? `OFF: ${res.product.brand}` : "OFF連携");
    }
  }, [lastLookup, notes]);

  useEffect(() => {
    if (isEdit || !cameraOn || !cameraSupported) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;

    const w = window as Window & {
      BarcodeDetector?: new () => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
    };

    void (async () => {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      } catch {
        if (!stopped) {
          setScanError("カメラを起動できませんでした。権限設定を確認してください。");
          setCameraOn(false);
        }
        return;
      }

      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");

      try {
        await video.play();
      } catch {
        if (!stopped) {
          setScanError("映像の再生を開始できませんでした。");
          setCameraOn(false);
        }
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (typeof w.BarcodeDetector !== "undefined") {
        try {
          const detector = new w.BarcodeDetector();
          while (!stopped) {
            if (!videoRef.current) break;
            try {
              const detected = await detector.detect(videoRef.current);
              const value = detected[0]?.rawValue?.trim();
              if (value) {
                setCameraOn(false);
                void handleLookupBarcode(value);
                break;
              }
            } catch {
              // フレームごとの検出失敗は無視して続行
            }
            await new Promise((r) => setTimeout(r, 350));
          }
        } catch {
          if (!stopped) {
            setScanError("バーコードの自動読み取りを開始できませんでした。");
            setCameraOn(false);
          }
        }
      } else {
        try {
          const hints = new Map<DecodeHintType, BarcodeFormat[]>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          const controls = reader.scan(video, (result, _err, ctrls) => {
            if (stopped || !result) return;
            const text = result.getText().trim();
            if (text) {
              ctrls.stop();
              setCameraOn(false);
              void handleLookupBarcode(text);
            }
          });
          stopZxing = () => controls.stop();
        } catch {
          if (!stopped) {
            setScanError("バーコードの自動読み取りを開始できませんでした。");
            setCameraOn(false);
          }
        }
      }
    })();

    return () => {
      stopped = true;
      stopZxing?.();
      stopZxing = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [isEdit, cameraOn, cameraSupported, handleLookupBarcode]);

  useEffect(() => {
    if (isEdit) return;
    const id = requestAnimationFrame(() => {
      if (!window.matchMedia("(min-width: 640px)").matches) return;
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isEdit]);

  function buildMenuPayload(): MenuItemUpdate {
    return {
      name: name.trim(),
      protein_per_100g: protein === "" ? null : parseFloat(protein),
      fat_per_100g: fat === "" ? null : parseFloat(fat),
      carbs_per_100g: carbs === "" ? null : parseFloat(carbs),
      shared_barcode: sharedBarcode,
      standard_food_code: standardFoodCode,
      default_grams: parseFloat(grams) || 100,
      rank,
      notes: notes.trim() || null,
      group_name: groupName.trim() || null,
    };
  }

  function buildSnapshotSaveItem(): SaveItem | null {
    if (!snapshotRestaurantId) return null;
    if (!name.trim()) return null;
    const gramsNum = parseFloat(grams) || 100;
    const p100 = protein === "" ? null : parseFloat(protein);
    const f100 = fat === "" ? null : parseFloat(fat);
    const c100 = carbs === "" ? null : parseFloat(carbs);
    const v = pfcFromPer100(
      p100 !== null && Number.isFinite(p100) ? p100 : null,
      f100 !== null && Number.isFinite(f100) ? f100 : null,
      c100 !== null && Number.isFinite(c100) ? c100 : null,
      gramsNum
    );
    return {
      menuItemId: null,
      name: name.trim(),
      totalGrams: gramsNum,
      proteinG: v.p,
      fatG: v.f,
      carbsG: v.c,
      restaurantId: snapshotRestaurantId,
    };
  }

  async function handleSave() {
    if (!name.trim()) { setError("名前を入力してください"); return; }
    setSaving(true); setError(null);
    const data = buildMenuPayload();

    if (isEdit && existing) {
      const result = await updateMenuItem(existing.id, data);
      if (result.error || !result.data) {
        setError(result.error ?? "保存に失敗しました");
        setSaving(false);
        return;
      }
      onSaved(result.data);
    } else {
      const restaurantId = state.kind === "add" ? state.restaurantId : "";
      const result = await addMenuItem(restaurantId, data);
      if (result.error || !result.data) { setError(result.error ?? "追加に失敗しました"); setSaving(false); return; }
      onSaved(result.data);
    }
    onClose();
    setSaving(false);
  }

  async function handleSnapshotLogOnly() {
    if (!name.trim()) { setError("名前を入力してください"); return; }
    if (!snapshotRestaurantId) {
      setError("スナップショット用の設定を読み込めていません。ページを再読み込みしてください。");
      return;
    }
    const item = buildSnapshotSaveItem();
    if (!item) return;
    setSaving(true); setError(null);
    const { error: logError } = await saveMealToLog([item], mealTypeForLog, logDate);
    setSaving(false);
    if (logError) {
      setError(logError);
      return;
    }
    await onAfterSnapshotLog();
    onClose();
  }

  function handleSnapshotToCart() {
    if (!name.trim()) { setError("名前を入力してください"); return; }
    if (!snapshotRestaurantId) {
      setError("スナップショット用の設定を読み込めていません。ページを再読み込みしてください。");
      return;
    }
    const gramsNum = parseFloat(grams) || 100;
    onSnapshotCart({
      name: name.trim(),
      protein_per_100g: protein === "" ? null : parseFloat(protein),
      fat_per_100g: fat === "" ? null : parseFloat(fat),
      carbs_per_100g: carbs === "" ? null : parseFloat(carbs),
      grams: gramsNum,
      shared_barcode: sharedBarcode,
    });
    onClose();
  }

  async function handleDelete() {
    if (!existing || !onDeleted) return;
    setDeleting(true);
    const result = await deleteMenuItem(existing.id);
    if (result.error) { setError(result.error); setDeleting(false); return; }
    onDeleted(existing.id);
    onClose();
  }

  const gramsNum = parseFloat(grams);
  const modeLabel = mode === "per100g"
    ? "100gあたり"
    : `1回分あたり（${isNaN(gramsNum) ? "?" : gramsNum}g）`;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] max-w-md flex-col rounded-t-2xl border-x border-t border-gray-700 bg-gray-900 mx-auto">
        <div className="flex-none flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex-none flex items-center justify-between gap-2 border-b border-gray-800 px-4 pb-3">
          <h2 className="flex min-w-0 flex-1 items-baseline gap-x-1 text-base font-semibold text-white">
            {isEdit ? (
              "メニュー編集"
            ) : registerTargetRestaurantName ? (
              <>
                <span className="truncate" title={registerTargetRestaurantName}>
                  {registerTargetRestaurantName}
                </span>
                <span className="shrink-0 whitespace-nowrap">へメニューを追加</span>
              </>
            ) : (
              "メニューを追加"
            )}
          </h2>
          <button onClick={onClose} className="shrink-0 text-sm text-gray-400 hover:text-white">
            キャンセル
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-4 py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div>
            <label className="block text-xs text-gray-400 mb-1">名前</label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (!cameraOn && !cameraSupported) {
                    setScanError(
                      "この環境ではカメラを利用できません。HTTPS で開いているか、ブラウザのカメラ権限を確認してください。"
                    );
                    return;
                  }
                  setScanError(null);
                  setCameraResult(null);
                  setServingHint(null);
                  setCameraOn((v) => !v);
                }}
                className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">{cameraOn ? "■" : "|||:"}</span>
                <span>{cameraOn ? "読み取りを停止" : "バーコード読み取り"}</span>
              </button>
              {cameraOn && (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className="mx-auto w-full max-h-[min(42svh,15rem)] rounded-lg border border-gray-700 bg-black aspect-video object-cover sm:max-h-none"
                />
              )}
              {scanLoading && <p className="text-xs text-emerald-300">読み取り結果を検索中...</p>}
              {cameraResult && (
                <p className="text-xs text-emerald-300">
                  読み取り完了: {cameraResult.product_name}（{cameraResult.barcode}）
                </p>
              )}
              {scanError && <p className="text-xs text-amber-300">{scanError}</p>}
              {servingHint && <p className="text-xs text-amber-300">{servingHint}</p>}
              <p className="text-[11px] text-gray-500">
                Data source: Open Food Facts (ODbL)
              </p>
              {onOpenStandardFoodSearch && (
                <button
                  type="button"
                  onClick={onOpenStandardFoodSearch}
                  className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors"
                >
                  文科省成分表で検索
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">1回の量（g）</label>
            <input type="number" value={grams} onChange={(e) => setGrams(e.target.value)}
              className="w-28 px-3 py-3 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">栄養素</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
                {(["per100g", "perServing"] as NutrientMode[]).map((m) => (
                  <button key={m} onClick={() => handleModeChange(m)}
                    className={`px-2.5 py-1 transition-colors ${mode === m ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                    {m === "per100g" ? "100gあたり" : `1回分（${isNaN(gramsNum) ? "?" : gramsNum}g）`}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: "P タンパク質", display: displayP, field: "p" as const, raw: rawP, setRaw: setRawP },
                { label: "F 脂質",       display: displayF, field: "f" as const, raw: rawF, setRaw: setRawF },
                { label: "C 糖質",       display: displayC, field: "c" as const, raw: rawC, setRaw: setRawC },
              ] as const).map(({ label, display, field, raw, setRaw }) => (
                <div key={field}>
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <input type="number" value={raw ?? display} placeholder="—"
                    onChange={(e) => setRaw(e.target.value)}
                    onBlur={() => commitNutrient(field, raw)}
                    className="w-full px-2 py-2 sm:py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-base sm:text-sm text-center focus:outline-none focus:border-emerald-500" />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1.5">入力単位: {modeLabel}</p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">ランク</label>
            <div className="grid grid-cols-2 gap-2">
              {RANK_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setRank(opt.value)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors text-left ${rank === opt.value ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">グループ名（任意）</label>
            <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
              list={existingGroupNames.length > 0 ? groupListId : undefined}
              placeholder="例: ホルモン系"
              className="w-full px-3 py-2.5 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500" />
            {existingGroupNames.length > 0 && (
              <datalist id={groupListId}>
                {existingGroupNames.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">メモ（任意）</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="例: 1切れ約15g"
              className="w-full px-3 py-2.5 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* 削除ボタン（編集モードのみ） */}
          {isEdit && onDeleted && (
            <div className="pt-2 border-t border-gray-800">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm">
                    キャンセル
                  </button>
                  <button onClick={handleDelete} disabled={deleting}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                    {deleting ? "削除中..." : "削除する"}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full py-2 text-red-400 hover:text-red-300 text-sm transition-colors">
                  このメニューを削除
                </button>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-gray-800 pt-4">
            {isEdit ? (
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full rounded-xl bg-emerald-600 py-3 font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存する"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  title={
                    registerTargetRestaurantName
                      ? `「${registerTargetRestaurantName}」のメニュー一覧に追加します`
                      : undefined
                  }
                  className="flex w-full flex-col items-center gap-0.5 rounded-xl bg-emerald-600 py-2.5 font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 sm:py-3"
                >
                  {saving ? (
                    "保存中..."
                  ) : (
                    <>
                      <span className="text-sm sm:text-base">メニューに登録</span>
                      {registerTargetRestaurantName ? (
                        <span className="max-w-full truncate px-1 text-[11px] font-normal text-emerald-100/90 sm:text-xs">
                          {registerTargetRestaurantName}
                        </span>
                      ) : (
                        <span className="text-[11px] font-normal text-emerald-100/80 sm:text-xs">
                          （お店タブを確認）
                        </span>
                      )}
                    </>
                  )}
                </button>
                <p className="hidden px-1 text-center text-[11px] leading-snug text-gray-500 sm:block">
                  メニュー一覧に載せずに記録するとき
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-2">
                  <button
                    type="button"
                    onClick={handleSnapshotToCart}
                    disabled={saving || !snapshotRestaurantId}
                    className="rounded-xl bg-gray-800 py-2.5 text-center text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50 sm:flex sm:flex-col sm:items-center sm:gap-0.5 sm:py-2.5 sm:text-sm"
                  >
                    <span>カートへ</span>
                    <span className="mt-0.5 hidden text-[11px] font-normal leading-tight text-gray-400 sm:block">
                      メニュー未登録・あとで記録
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSnapshotLogOnly()}
                    disabled={saving || !snapshotRestaurantId}
                    className="rounded-xl border border-gray-600 py-2.5 text-center text-xs font-medium text-gray-200 transition-colors hover:border-gray-500 disabled:opacity-50 sm:flex sm:flex-col sm:items-center sm:gap-0.5 sm:py-2.5 sm:text-sm"
                  >
                    <span className="sm:hidden">今すぐ記録</span>
                    <span className="hidden sm:inline">今すぐ食事ログに記録</span>
                    <span className="mt-0.5 hidden text-[11px] font-normal leading-tight text-gray-400 sm:block">
                      カートを使わずいま保存
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── お店追加ドロワー ──────────────────────────────────────────────────────────

function AddRestaurantDrawer({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (restaurant: Restaurant) => void;
}) {
  const [name, setName]         = useState("");
  const [category, setCategory] = useState("external");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setError("お店の名前を入力してください"); return; }
    setSaving(true); setError(null);
    const result = await addRestaurant(name.trim(), category);
    if (result.error || !result.data) { setError(result.error ?? "追加に失敗しました"); setSaving(false); return; }
    onAdded(result.data);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl max-w-md mx-auto border-x border-t border-gray-700 flex flex-col pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex-none flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex-none flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">お店を追加</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">キャンセル</button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">お店の名前</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              autoFocus placeholder="例: 神鶏"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">カテゴリ</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setCategory(opt.value)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${category === opt.value ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="px-4 py-4 border-t border-gray-800">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
            {saving ? "追加中..." : "追加する"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── エクスポートユーティリティ ────────────────────────────────────────────────

const EXPORT_SCHEMA = {
  _schema: {
    description: "Ketolog restaurant export v1 — このファイルをそのまま編集してインポートできます",
    name: "string (必須, 最大50文字) — お店の名前",
    category: "string (必須) — external（外食）/ homemade（自炊）/ convenience（コンビニ）/ other（その他）のいずれか",
    "menuItems[].name": "string (必須, 最大100文字) — メニューアイテム名",
    "menuItems[].protein_per_100g": "number or null — 100gあたりタンパク質 (g)",
    "menuItems[].fat_per_100g": "number or null — 100gあたり脂質 (g)",
    "menuItems[].carbs_per_100g": "number or null — 100gあたり糖質 (g)",
    "menuItems[].shared_barcode": "string or null — 市販品参照バーコード（OFF連携時）",
    "menuItems[].standard_food_code": "string or null — 文科省標準成分表の食品番号（5桁）",
    "menuItems[].default_grams": "number (必須, 1以上) — 1回分のデフォルト重量 (g)",
    "menuItems[].rank": "1〜4の整数 (必須) — 1=◎最優先 / 2=○通常 / 3=△控えめ / 4=✕避ける",
    "menuItems[].notes": "string or null — メモ（任意）",
    "menuItems[].group": "string or null — グループ名（任意。同じ値のアイテムがまとめて表示されます）",
  },
} as const;

function downloadRestaurantJson(restaurant: Restaurant, menuItems: MenuItem[]) {
  const payload = {
    version: 1,
    ...EXPORT_SCHEMA,
    name: restaurant.name,
    category: restaurant.category,
    menuItems: menuItems
      .filter((m) => m.restaurant_id === restaurant.id)
      .map((m) => ({
        name: m.name,
        protein_per_100g: m.protein_per_100g,
        fat_per_100g: m.fat_per_100g,
        carbs_per_100g: m.carbs_per_100g,
        shared_barcode: m.shared_barcode ?? null,
        standard_food_code: m.standard_food_code ?? null,
        default_grams: m.default_grams,
        rank: m.rank,
        notes: m.notes,
        group: m.group_name,
      })),
  };
  const date = new Date().toISOString().split("T")[0];
  const slug = restaurant.name.replace(/\s+/g, "-");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ketolog-${slug}-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// JSONをパースして単一レストランのデータを取得
type SingleRestaurantJson = {
  version: number;
  name: string;
  category: string;
  menuItems: ImportRestaurantItem[];
};

function parseSingleRestaurantJson(text: string): SingleRestaurantJson | { error: string } {
  try {
    const raw = JSON.parse(text);
    if (!raw.version || typeof raw.name !== "string" || !Array.isArray(raw.menuItems)) {
      return { error: "フォーマットが正しくありません（version / name / menuItems が必要です）" };
    }
    const invalidItems = (raw.menuItems as ImportRestaurantItem[])
      .map((item, i) => {
        if (item.shared_barcode !== undefined && item.shared_barcode !== null && typeof item.shared_barcode !== "string") {
          return `${i + 1}番目「${item.name}」の shared_barcode が不正です（文字列またはnull）`;
        }
        if (
          item.standard_food_code !== undefined &&
          item.standard_food_code !== null &&
          (typeof item.standard_food_code !== "string" || !/^\d{5}$/.test(item.standard_food_code))
        ) {
          return `${i + 1}番目「${item.name}」の standard_food_code は5桁の数字文字列またはnullにしてください`;
        }
        if (item.rank < 1 || item.rank > 4 || !Number.isInteger(item.rank)) {
          return `${i + 1}番目「${item.name}」の rank が不正です（1〜4の整数を指定してください）`;
        }
        if (typeof item.default_grams !== "number" || item.default_grams <= 0) {
          return `${i + 1}番目「${item.name}」の default_grams が不正です（1以上の数値を指定してください）`;
        }
        return null;
      })
      .filter(Boolean);
    if (invalidItems.length > 0) return { error: invalidItems.join("\n") };
    return raw as SingleRestaurantJson;
  } catch {
    return { error: "JSONの解析に失敗しました。ファイルの形式を確認してください。" };
  }
}

function downloadTemplate() {
  const payload = {
    version: 1,
    ...EXPORT_SCHEMA,
    _prompt_hint: "このJSONテンプレートに従って [お店名] のメニューを作成してください。rankの基準: ケトジェニックダイエット視点で、糖質が少なく脂質・タンパク質が豊富なものを1（最優先）、糖質が多いものや避けるべきものを4（避ける）としてください。default_gramsは1人前の一般的な提供量（g）を入れてください。栄養素は100gあたりの値で入力してください。",
    name: "お店の名前をここに入力",
    category: "external",
    menuItems: [
      {
        name: "メニュー名",
        protein_per_100g: null,
        fat_per_100g: null,
        carbs_per_100g: null,
        shared_barcode: null,
        standard_food_code: null,
        default_grams: 100,
        rank: 2,
        notes: null,
        group: null,
      },
    ],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ketolog-template.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── お店追加 選択シート ────────────────────────────────────────────────────────

function RestaurantAddChoiceSheet({
  onManual,
  onImport,
  onPreset,
  onClose,
}: {
  onManual: () => void;
  onImport: () => void;
  onPreset: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="px-4 pb-8 pt-2 space-y-3">
          <p className="text-center text-sm font-semibold text-white pb-1">お店を追加</p>
          <button onClick={onManual}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors">
            手入力で追加
          </button>
          <button onClick={onImport}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors">
            JSONからインポート
          </button>
          <button onClick={onPreset}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors">
            プリセットから選ぶ
          </button>
        </div>
      </div>
    </>
  );
}

// ─── プリセット定義 ────────────────────────────────────────────────────────────

const PRESET_BASE = "/presets";

// ─── JSONからお店をインポート（新規追加）ドロワー ──────────────────────────────

function ImportRestaurantDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (restaurant: Restaurant, items: MenuItem[]) => void;
}) {
  const [parsed, setParsed]         = useState<SingleRestaurantJson | null>(null);
  const [importing, setImporting]   = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsed(null); setParseError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseSingleRestaurantJson(reader.result as string);
      if ("error" in result) { setParseError(result.error); return; }
      setParsed(result);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    const res = await importRestaurantData({
      version: 1,
      restaurants: [{ name: parsed.name, category: parsed.category, menuItems: parsed.menuItems }],
    });
    if (res.error) { setParseError(res.error); setImporting(false); return; }
    if (res.newRestaurants.length === 0) {
      setParseError(`「${parsed.name}」は既に登録されています。`);
      setImporting(false); return;
    }
    onImported(res.newRestaurants[0], res.newMenuItems);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[80svh] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">JSONからお店を追加</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">キャンセル</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <label className="block w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-xl text-center cursor-pointer transition-colors">
            JSONファイルを選択
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
          </label>
          <button onClick={downloadTemplate}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm rounded-xl transition-colors">
            テンプレートをダウンロード
          </button>
          {parseError && <p className="text-red-400 text-xs">{parseError}</p>}
          {parsed && (
            <div className="bg-gray-800 rounded-lg p-3 space-y-1">
              <p className="text-sm text-white font-medium">{parsed.name}</p>
              <p className="text-xs text-gray-400">{parsed.menuItems.length}アイテム</p>
            </div>
          )}
        </div>
        <div className="px-4 py-4 border-t border-gray-800">
          <button onClick={handleImport} disabled={!parsed || importing}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm">
            {importing ? "インポート中..." : "インポートする"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── プリセット選択ドロワー ────────────────────────────────────────────────────

function PresetSelectDrawer({
  onClose,
  onImported,
  presets,
}: {
  onClose: () => void;
  onImported: (restaurant: Restaurant, items: MenuItem[]) => void;
  presets: { name: string; file: string; itemCount: number }[];
}) {
  const PRESET_VISIBLE = 5;
  const [fetchingPreset, setFetchingPreset] = useState<string | null>(null);
  const [fetchError, setFetchError]         = useState<string | null>(null);
  const [expanded, setExpanded]             = useState(false);

  const visiblePresets = expanded ? presets : presets.slice(0, PRESET_VISIBLE);

  async function handleSelect(file: string) {
    setFetchingPreset(file); setFetchError(null);
    try {
      const res = await fetch(`${PRESET_BASE}/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseSingleRestaurantJson(text);
      if ("error" in parsed) { setFetchError(parsed.error); return; }
      const result = await importRestaurantData({
        version: 1,
        restaurants: [{ name: parsed.name, category: parsed.category, menuItems: parsed.menuItems }],
      });
      if (result.error) { setFetchError(result.error); return; }
      if (result.newRestaurants.length === 0) {
        setFetchError(`「${parsed.name}」は既に登録されています。`); return;
      }
      onImported(result.newRestaurants[0], result.newMenuItems);
      onClose();
    } catch {
      setFetchError("取得に失敗しました。ネットワークを確認してください。");
    } finally {
      setFetchingPreset(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[70svh] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">プリセットから選ぶ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">キャンセル</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
          {visiblePresets.map((preset) => (
            <button key={preset.file}
              onClick={() => handleSelect(preset.file)}
              disabled={fetchingPreset !== null}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-50 transition-colors text-left">
              <span>{preset.name}</span>
              <span className="text-xs text-gray-500">
                {fetchingPreset === preset.file ? "取得中..." : `${preset.itemCount}品`}
              </span>
            </button>
          ))}
          {presets.length > PRESET_VISIBLE && (
            <button onClick={() => setExpanded((v) => !v)}
              className="w-full py-1.5 text-xs text-gray-500 hover:text-white transition-colors">
              {expanded ? "▲ 折り畳む" : `▼ さらに${presets.length - PRESET_VISIBLE}件表示`}
            </button>
          )}
          {fetchError && <p className="text-red-400 text-xs pt-1">{fetchError}</p>}
        </div>
      </div>
    </>
  );
}

// ─── JSONからメニューを追加（既存お店）ドロワー ────────────────────────────────

function ImportMenuItemsDrawer({
  restaurant,
  onClose,
  onImported,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onImported: (items: MenuItem[]) => void;
}) {
  const [parsed, setParsed] = useState<SingleRestaurantJson | null>(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null); setParsed(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseSingleRestaurantJson(reader.result as string);
      if ("error" in result) { setParseError(result.error); return; }
      setParsed(result);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    const res = await importMenuItemsToRestaurant(restaurant.id, parsed.menuItems);
    if (res.error) { setParseError(res.error); setImporting(false); return; }
    onImported(res.newMenuItems);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[70svh] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">メニューをJSONで追加</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">キャンセル</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-xs text-gray-400">「{restaurant.name}」にメニューアイテムを追加します。</p>
          <label className="block w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg text-center cursor-pointer transition-colors">
            JSONファイルを選択
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
          </label>
          {parseError && <p className="text-red-400 text-xs">{parseError}</p>}
          {parsed && (
            <div className="bg-gray-800 rounded-lg p-3 space-y-1">
              <p className="text-xs text-gray-400">{parsed.menuItems.length}アイテムを追加します</p>
            </div>
          )}
        </div>
        <div className="px-4 py-4 border-t border-gray-800">
          <button onClick={handleImport} disabled={!parsed || importing}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm">
            {importing ? "インポート中..." : "追加する"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── メニューアイテム行 ────────────────────────────────────────────────────────

const RANK_ICON: Record<number, { icon: string; className: string }> = {
  1: { icon: "◎", className: "text-emerald-400" },
  2: { icon: "○", className: "text-gray-500" },
  3: { icon: "△", className: "text-amber-400" },
  4: { icon: "✕", className: "text-red-400" },
};

function MenuItemRow({ item, entry, onAdd, onRemove, onChangeGrams, onEdit, onToggleFavorite, isFavorited, originCaption, pfcTargets }: {
  item: MenuItem; entry: CartEntry | undefined;
  onAdd: (grams: number) => void; onRemove: () => void;
  onChangeGrams: (g: number) => void; onEdit: () => void;
  onToggleFavorite: () => void | Promise<void>;
  isFavorited: boolean;
  originCaption?: string | null;
  pfcTargets: MacroHighlightTargets;
}) {
  const [editingGrams, setEditingGrams] = useState(false);
  const [gramsInput, setGramsInput] = useState("");
  const [localGrams, setLocalGrams] = useState(item.default_grams);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayGrams = entry?.gramsPerServing ?? localGrams;
  const serving = pfc(item, displayGrams);
  const count = entry?.count ?? 0;
  const rank = RANK_ICON[item.rank] ?? RANK_ICON[2];
  const { highlightP, highlightF } =
    item.protein_per_100g !== null
      ? menuRowMacroHighlights(serving, item, pfcTargets)
      : { highlightP: false, highlightF: false };

  const menuItemPfcLine =
    item.protein_per_100g !== null ? (
      <>
        <span className={highlightP ? MACRO_MENU_TEXT.p : "text-gray-500"}>P{fmt(serving.p)}</span>{" "}
        <span className={highlightF ? MACRO_MENU_TEXT.f : "text-gray-500"}>F{fmt(serving.f)}</span>{" "}
        <span className="text-gray-500">C{fmt(serving.c)}</span>
      </>
    ) : (
      <span className="text-gray-500">PFC未設定 — タップして編集</span>
    );

  function startGramsEdit() {
    setGramsInput(displayGrams.toString());
    setEditingGrams(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitGramsEdit() {
    const val = parseFloat(gramsInput);
    if (!isNaN(val) && val > 0) {
      if (entry) {
        onChangeGrams(val);
      } else {
        setLocalGrams(val);
      }
    }
    setEditingGrams(false);
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2.5 border-b border-gray-800/60">
      <button
        type="button"
        aria-label={isFavorited ? "お気に入りを解除" : "お気に入りに追加"}
        onClick={(e) => {
          e.stopPropagation();
          void onToggleFavorite();
        }}
        className={`shrink-0 w-8 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-sm sm:text-base leading-none rounded-lg sm:rounded-md active:bg-gray-800/70 touch-manipulation ${
          isFavorited ? "text-amber-400" : "text-gray-600 hover:text-gray-400"
        }`}
      >
        {isFavorited ? "★" : "☆"}
      </button>
      <span className={`text-[11px] sm:text-xs shrink-0 w-3.5 sm:w-4 flex justify-center ${rank.className}`}>{rank.icon}</span>
      <button type="button" className="flex-1 min-w-0 text-left py-0.5 -my-0.5" onClick={onEdit}>
        <p className="text-xs sm:text-sm text-white truncate leading-snug">{item.name}</p>
        {originCaption ? (
          <>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate leading-snug">{originCaption}</p>
            <p className="text-[11px] sm:text-xs mt-0.5 tabular-nums leading-snug">{menuItemPfcLine}</p>
          </>
        ) : (
          <p className="text-[11px] sm:text-xs mt-0.5 tabular-nums leading-snug">{menuItemPfcLine}</p>
        )}
      </button>

      <div className="shrink-0">
        {editingGrams ? (
          <input ref={inputRef} type="number" value={gramsInput}
            onChange={(e) => setGramsInput(e.target.value)}
            onBlur={commitGramsEdit}
            onKeyDown={(e) => e.key === "Enter" && commitGramsEdit()}
            className="w-[3.5rem] sm:w-14 text-center text-xs sm:text-sm bg-gray-800 border border-emerald-500 rounded px-0.5 py-0.5 sm:py-0.5 text-white" />
        ) : (
          <button type="button" onClick={startGramsEdit}
            className="text-[11px] sm:text-xs text-gray-400 hover:text-white transition-colors min-h-7 min-w-7 sm:min-h-0 sm:min-w-0 px-0.5 py-0.5 rounded-md sm:rounded-none active:bg-gray-800/80 tabular-nums">
            {displayGrams}g
          </button>
        )}
      </div>

      {count === 0 ? (
        <button type="button" onClick={() => onAdd(displayGrams)}
          className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-base sm:text-lg font-bold shrink-0">
          +
        </button>
      ) : (
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button type="button" onClick={onRemove}
            className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm sm:text-base">−</button>
          <span className="w-4 sm:w-5 text-center text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">{count}</span>
          <button type="button" onClick={() => onAdd(displayGrams)}
            className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm sm:text-base">+</button>
        </div>
      )}
    </div>
  );
}

// ─── 日付ユーティリティ ────────────────────────────────────────────────────────

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function formatNavDate(dateStr: string, today: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const label = `${d.getMonth() + 1}/${d.getDate()}（${DAY_LABELS[d.getDay()]}）`;
  return dateStr === today ? `今日 ${label}` : label;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toLocaleDateString("sv-SE");
}

// ─── 食事ログ エントリ行 ────────────────────────────────────────────────────────

function LogEntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: FoodLogEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 px-2.5 py-0.5 sm:px-4 sm:py-2 border-b border-gray-800/40">
      <span className="flex-1 min-w-0 text-xs sm:text-sm text-white truncate leading-tight">{entry.item_name}</span>
      <span className="text-[11px] sm:text-xs text-gray-400 shrink-0 tabular-nums leading-tight">{entry.grams}g</span>
      <span className="text-[11px] sm:text-xs text-gray-500 shrink-0 tabular-nums w-[6.5rem] sm:w-28 text-right leading-tight">
        P{fmt(entry.protein_g)} F{fmt(entry.fat_g)} C{fmt(entry.carbs_g)}
      </span>
      <button type="button" onClick={onEdit} className="text-gray-400 hover:text-white text-xs sm:text-xs min-h-7 min-w-7 sm:min-h-0 sm:min-w-0 flex items-center justify-center shrink-0 rounded-md sm:rounded-none active:bg-gray-800/70 leading-none">✎</button>
      <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-300 text-xs sm:text-xs min-h-7 min-w-7 sm:min-h-0 sm:min-w-0 flex items-center justify-center shrink-0 rounded-md sm:rounded-none active:bg-gray-800/70 leading-none">✕</button>
    </div>
  );
}

// ─── 食事ログ エントリ編集ドロワー ─────────────────────────────────────────────

function EditEntryDrawer({
  entry,
  onClose,
  onSaved,
}: {
  entry: FoodLogEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [grams, setGrams]       = useState(entry.grams.toString());
  const [mealType, setMealType] = useState(entry.meal_type);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const gramsNum = parseFloat(grams);
  const oldGrams = entry.grams || 1;
  const pPer100 = (entry.protein_g ?? 0) * 100 / oldGrams;
  const fPer100 = (entry.fat_g ?? 0) * 100 / oldGrams;
  const cPer100 = (entry.carbs_g ?? 0) * 100 / oldGrams;
  const preview = isNaN(gramsNum) || gramsNum <= 0 ? null : {
    p: pPer100 * gramsNum / 100,
    f: fPer100 * gramsNum / 100,
    c: cPer100 * gramsNum / 100,
  };

  async function handleSave() {
    if (isNaN(gramsNum) || gramsNum <= 0) { setError("グラム数を正しく入力してください"); return; }
    setSaving(true); setError(null);
    const result = await updateFoodLogEntry(entry.id, gramsNum, mealType);
    if (result.error) { setError(result.error); setSaving(false); return; }
    onSaved();
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white truncate pr-4">{entry.item_name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm shrink-0">キャンセル</button>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">食事タイプ</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(MEAL_LABELS) as MealType[]).map((t) => (
                <button key={t} type="button" onClick={() => setMealType(t)}
                  className={`py-3 sm:py-2 rounded-lg text-sm sm:text-xs font-medium transition-colors min-h-11 sm:min-h-0 ${mealType === t ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                  {MEAL_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">グラム数</label>
            <input type="number" value={grams} onChange={(e) => setGrams(e.target.value)}
              className="w-28 px-3 py-3 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500" />
            {preview && (
              <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                → P{fmt(preview.p)} / F{fmt(preview.f)} / C{fmt(preview.c)}g
              </p>
            )}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <div className="px-4 py-4 border-t border-gray-800">
          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full min-h-12 sm:min-h-0 py-3.5 sm:py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-base sm:text-sm">
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── 設定ドロワー ──────────────────────────────────────────────────────────────

function SettingsDrawer({
  settings,
  restaurants,
  menuItems,
  onClose,
  onSaved,
}: {
  settings: UserSettings;
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  onClose: () => void;
  onSaved: (updated: UserSettings) => void;
}) {
  const [protein, setProtein] = useState(settings.protein_target_g.toString());
  const [fat, setFat]         = useState(settings.fat_target_g.toString());
  const [carbs, setCarbs]     = useState(settings.carbs_target_g.toString());
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSave() {
    const p = parseFloat(protein), f = parseFloat(fat), c = parseFloat(carbs);
    if (isNaN(p) || isNaN(f) || isNaN(c) || p <= 0 || f <= 0 || c <= 0) {
      setError("正の数値を入力してください"); return;
    }
    setSaving(true); setError(null);
    const result = await updateUserSettings({ protein_target_g: p, fat_target_g: f, carbs_target_g: c });
    if (result.error) { setError(result.error); setSaving(false); return; }
    onSaved({ ...settings, protein_target_g: p, fat_target_g: f, carbs_target_g: c });
    onClose();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[80svh] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">閉じる</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* PFC目標値 */}
          <div>
            <h3 className="text-sm font-medium text-white mb-3">PFC目標値（g/日）</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "P タンパク質", value: protein, set: setProtein, color: "text-blue-400" },
                { label: "F 脂質",       value: fat,     set: setFat,     color: "text-yellow-400" },
                { label: "C 糖質",       value: carbs,   set: setCarbs,   color: "text-emerald-400" },
              ].map(({ label, value, set, color }) => (
                <div key={label}>
                  <p className={`text-xs mb-1 ${color}`}>{label}</p>
                  <div className="flex items-center gap-1">
                    <input type="number" value={value} onChange={(e) => set(e.target.value)}
                      className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm text-center focus:outline-none focus:border-emerald-500" />
                    <span className="text-xs text-gray-500 shrink-0">g</span>
                  </div>
                </div>
              ))}
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            <button onClick={handleSave} disabled={saving}
              className="mt-3 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>

          {/* 全データエクスポート */}
          <div>
            <h3 className="text-sm font-medium text-white mb-1">データエクスポート</h3>
            <p className="text-xs text-gray-400 mb-3">
              全レストラン（{restaurants.length}店舗・{menuItems.length}アイテム）をまとめてエクスポートします。
            </p>
            <button
              onClick={() => downloadAllRestaurants(restaurants, menuItems)}
              className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-xl transition-colors">
              全データをJSONでダウンロード
            </button>
          </div>

          <div>
            <h3 className="text-sm font-medium text-white mb-1">データソース</h3>
            <p className="text-xs text-gray-400">
              市販品データは Open Food Facts を利用しています（ODbL）。
              <a
                href="https://world.openfoodfacts.org"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
              >
                Open Food Facts
              </a>
            </p>
          </div>

          {/* ログアウト */}
          <div className="pt-2 border-t border-gray-800">
            <button onClick={handleLogout}
              className="w-full py-2.5 text-red-400 hover:text-red-300 text-sm transition-colors">
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function downloadAllRestaurants(restaurants: Restaurant[], menuItems: MenuItem[]) {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString().split("T")[0],
    restaurants: restaurants.map((r) => ({
      name: r.name,
      category: r.category,
      menuItems: menuItems
        .filter((m) => m.restaurant_id === r.id)
        .map((m) => ({
          name: m.name,
          protein_per_100g: m.protein_per_100g,
          fat_per_100g: m.fat_per_100g,
          carbs_per_100g: m.carbs_per_100g,
          shared_barcode: m.shared_barcode ?? null,
          standard_food_code: m.standard_food_code ?? null,
          default_grams: m.default_grams,
          rank: m.rank,
          notes: m.notes,
          group: m.group_name,
        })),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ketolog-all-${payload.exportedAt}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function SortableRestaurantTab({
  restaurant,
  selected,
  onSelect,
}: {
  restaurant: Restaurant;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: restaurant.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex shrink-0 items-stretch border-b-2 min-h-9 sm:min-h-0 ${
        selected ? "border-emerald-500" : "border-transparent"
      }`}
    >
      <button
        type="button"
        className="pl-2 pr-1 sm:pl-1.5 sm:pr-0.5 flex items-center text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing touch-manipulation"
        aria-label={`${restaurant.name}の表示順を変更`}
        suppressHydrationWarning
        {...attributes}
        {...listeners}
      >
        ⣿
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={`pl-1 pr-3 sm:pl-0.5 sm:pr-2.5 py-1.5 sm:py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap text-left transition-colors touch-manipulation min-w-0 max-w-[12rem] sm:max-w-none truncate ${
          selected ? "text-white" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        {restaurant.name}
      </button>
    </div>
  );
}

// ─── メインコンポーネント ───────────────────────────────────────────────────────

interface Props {
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  initialFavoriteGroups: FavoriteGroupPayload[];
  settings: UserSettings;
  todayConsumed: TodayConsumed;
  today: string;
  initialLogEntries: FoodLogEntry[];
  presets: { name: string; file: string; itemCount: number }[];
  initialMealType: MealType;
  snapshotRestaurantId: string;
}

export default function TodayClient({
  restaurants: initialRestaurants,
  menuItems: initialMenuItems,
  initialFavoriteGroups,
  settings,
  todayConsumed,
  today,
  initialLogEntries,
  presets,
  initialMealType,
  snapshotRestaurantId,
}: Props) {
  const [currentSettings, setCurrentSettings] = useState<UserSettings>(settings);
  const [showSettings, setShowSettings]       = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialRestaurants);
  const [menuItems, setMenuItems]     = useState<MenuItem[]>(initialMenuItems);
  const [favoriteGroups, setFavoriteGroups] = useState<FavoriteGroupPayload[]>(initialFavoriteGroups);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(() =>
    firstTabRestaurantId(initialRestaurants)
  );
  const [cart, setCart]             = useState<Map<string, CartEntry>>(new Map());
  const [mealType, setMealType]     = useState<MealType>(initialMealType);
  const [saving, setSaving]         = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const wide = window.matchMedia("(min-width: 640px)").matches;
      if (wide) setCartExpanded(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const [itemDrawer, setItemDrawer] = useState<ItemDrawerState | null>(null);
  const [compositionTargetRestaurantId, setCompositionTargetRestaurantId] =
    useState("");
  const lastRealRestaurantTabIdRef = useRef<string>("");
  const [deletingRestaurant, setDeletingRestaurant] = useState(false);
  const [confirmDeleteRestaurant, setConfirmDeleteRestaurant] = useState(false);
  const [showImportMenuItems, setShowImportMenuItems] = useState(false);

  // ── 日付ナビゲーション ────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]       = useState(today);
  const [consumedForDate, setConsumedForDate] = useState(todayConsumed);
  const [logEntries, setLogEntries]           = useState<FoodLogEntry[]>(initialLogEntries);
  const [loadingDate, setLoadingDate]         = useState(false);
  const [showLogEntries, setShowLogEntries]   = useState(false);
  const [editingEntry, setEditingEntry]       = useState<FoodLogEntry | null>(null);

  type RestaurantAddSheet = "choice" | "manual" | "import" | "preset" | null;
  const [restaurantAddSheet, setRestaurantAddSheet] = useState<RestaurantAddSheet>(null);

  const tabRestaurants = useMemo(
    () => restaurants.filter((r) => !isSnapshotRestaurant(r)),
    [restaurants]
  );

  const selectedRestaurantIdResolved = useMemo(() => {
    if (selectedRestaurantId === FAVORITES_TAB_ID) return FAVORITES_TAB_ID;
    if (selectedRestaurantId === MEXT_COMPOSITION_TAB_ID) {
      return MEXT_COMPOSITION_TAB_ID;
    }
    if (tabRestaurants.length === 0) return "";
    if (tabRestaurants.some((r) => r.id === selectedRestaurantId)) {
      return selectedRestaurantId;
    }
    return tabRestaurants[0].id;
  }, [tabRestaurants, selectedRestaurantId]);

  useEffect(() => {
    if (
      selectedRestaurantIdResolved !== FAVORITES_TAB_ID &&
      selectedRestaurantIdResolved !== MEXT_COMPOSITION_TAB_ID &&
      selectedRestaurantIdResolved
    ) {
      lastRealRestaurantTabIdRef.current = selectedRestaurantIdResolved;
    }
  }, [selectedRestaurantIdResolved]);

  const resolvedCompositionTargetId = useMemo(() => {
    if (tabRestaurants.length === 0) return "";
    if (
      compositionTargetRestaurantId &&
      tabRestaurants.some((r) => r.id === compositionTargetRestaurantId)
    ) {
      return compositionTargetRestaurantId;
    }
    return tabRestaurants[0]!.id;
  }, [tabRestaurants, compositionTargetRestaurantId]);

  const menuAddRestaurantId = useMemo(() => {
    if (selectedRestaurantIdResolved === MEXT_COMPOSITION_TAB_ID) {
      return resolvedCompositionTargetId;
    }
    if (selectedRestaurantIdResolved === FAVORITES_TAB_ID) {
      return tabRestaurants[0]?.id ?? "";
    }
    return selectedRestaurantIdResolved;
  }, [selectedRestaurantIdResolved, tabRestaurants, resolvedCompositionTargetId]);

  const selectedRestaurant = restaurants.find(
    (r) => r.id === selectedRestaurantIdResolved
  );
  const drawerRestaurantId =
    itemDrawer?.kind === "add"
      ? itemDrawer.restaurantId
      : itemDrawer?.kind === "edit"
        ? itemDrawer.item.restaurant_id
        : "";
  const existingGroupNamesForDrawer = useMemo(() => {
    if (!drawerRestaurantId) return [];
    const names = new Set<string>();
    for (const item of menuItems) {
      if (item.restaurant_id !== drawerRestaurantId) continue;
      const n = item.group_name?.trim();
      if (n) names.add(n);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ja"));
  }, [menuItems, drawerRestaurantId]);
  const tabRestaurantIds = useMemo(
    () => tabRestaurants.map((r) => r.id),
    [tabRestaurants]
  );

  const restaurantNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of restaurants) m.set(r.id, r.name);
    return m;
  }, [restaurants]);

  const favoriteMenuItemIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of favoriteGroups) {
      for (const e of g.entries) s.add(e.menu_item_id);
    }
    return s;
  }, [favoriteGroups]);
  const restaurantSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  async function handleRestaurantDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabRestaurants.findIndex((r) => r.id === active.id);
    const newIndex = tabRestaurants.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(tabRestaurants, oldIndex, newIndex).map((r, index) => ({
      ...r,
      display_order: index,
    }));
    const previous = restaurants;
    const tabIdSet = new Set(tabRestaurants.map((r) => r.id));
    const rest = restaurants.filter((r) => !tabIdSet.has(r.id));
    setRestaurants([...moved, ...rest]);
    const result = await reorderRestaurants(moved.map((r) => r.id));
    if (result.error) {
      alert(result.error);
      setRestaurants(previous);
    }
  }

  async function handleToggleFavorite(item: MenuItem) {
    const was = favoriteMenuItemIds.has(item.id);
    if (was) {
      const result = await removeMenuItemFromFavorites(item.id);
      if (result.error) {
        alert(result.error);
        return;
      }
      if (result.data) setFavoriteGroups(result.data);
    } else {
      const result = await addMenuItemToFavorites(item.id);
      if (result.error) {
        alert(result.error);
        return;
      }
      if (result.data) setFavoriteGroups(result.data);
    }
  }

  // ── カート計算 ──────────────────────────────────────────────────────────────
  const cartPFC = useMemo(() => {
    let p = 0, f = 0, c = 0;
    cart.forEach((entry) => {
      const g = entry.gramsPerServing * entry.count;
      if (entry.kind === "menu") {
        p += (entry.item.protein_per_100g ?? 0) * g / 100;
        f += (entry.item.fat_per_100g ?? 0) * g / 100;
        c += (entry.item.carbs_per_100g ?? 0) * g / 100;
      } else {
        const v = pfcFromPer100(entry.protein_per_100g, entry.fat_per_100g, entry.carbs_per_100g, g);
        p += v.p;
        f += v.f;
        c += v.c;
      }
    });
    return { p, f, c };
  }, [cart]);

  const totalPFC = {
    p: consumedForDate.protein + cartPFC.p,
    f: consumedForDate.fat + cartPFC.f,
    c: consumedForDate.carbs + cartPFC.c,
  };

  const [headerHintTimeTick, setHeaderHintTimeTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeaderHintTimeTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const headerHintRaw = useMemo(() => {
    void headerHintTimeTick;
    if (selectedDate !== today) return null;
    const slot = getActiveHintSlot(new Date());
    if (!slot) return null;
    return computeHeaderHintText({
      slot,
      consumed: { p: totalPFC.p, f: totalPFC.f, c: totalPFC.c },
      targets: {
        p: currentSettings.protein_target_g,
        f: currentSettings.fat_target_g,
        c: currentSettings.carbs_target_g,
      },
    });
  }, [
    selectedDate,
    today,
    currentSettings,
    totalPFC.p,
    totalPFC.f,
    totalPFC.c,
    headerHintTimeTick,
  ]);

  const [headerHint, setHeaderHint] = useState<string | null>(null);
  const [headerHintFullOpen, setHeaderHintFullOpen] = useState(false);
  const headerHintDisplayedRef = useRef<string | null>(null);

  useEffect(() => {
    if (headerHintRaw === null) {
      headerHintDisplayedRef.current = null;
      const clearId = window.setTimeout(() => {
        setHeaderHint(null);
      }, 0);
      return () => clearTimeout(clearId);
    }
    if (headerHintDisplayedRef.current === null) {
      const showId = window.setTimeout(() => {
        headerHintDisplayedRef.current = headerHintRaw;
        setHeaderHint(headerHintRaw);
      }, 0);
      return () => clearTimeout(showId);
    }
    if (headerHintDisplayedRef.current === headerHintRaw) return;
    const id = window.setTimeout(() => {
      headerHintDisplayedRef.current = headerHintRaw;
      setHeaderHint(headerHintRaw);
    }, HEADER_HINT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [headerHintRaw]);

  useEffect(() => {
    if (headerHint !== null) return;
    const id = window.setTimeout(() => {
      setHeaderHintFullOpen(false);
    }, 0);
    return () => clearTimeout(id);
  }, [headerHint]);

  useEffect(() => {
    if (!headerHintFullOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHeaderHintFullOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [headerHintFullOpen]);

  const cartEntries = useMemo(() => Array.from(cart.values()).filter((e) => e.count > 0), [cart]);
  const hasCart = cartEntries.length > 0;

  // ── メニュー表示 ────────────────────────────────────────────────────────────
  type MenuGroup = {
    sectionKey: string;
    groupName: string | null;
    groupOrder: number;
    items: MenuItem[];
    /** お気に入りタブ用: 行ごとの由来（店名・店内グループ） */
    originByItemId?: Record<string, string>;
  };

  const menuGroups = useMemo((): MenuGroup[] => {
    if (selectedRestaurantIdResolved === FAVORITES_TAB_ID) {
      return favoriteGroups
        .filter((g) => g.entries.length > 0)
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((g) => {
          const originByItemId: Record<string, string> = {};
          const items: MenuItem[] = g.entries
            .slice()
            .sort((x, y) => x.display_order - y.display_order)
            .map((e) => {
              const live = menuItems.find((m) => m.id === e.menu_item_id) ?? e.menu_item;
              const rname = restaurantNameById.get(live.restaurant_id) ?? "お店";
              const gn = live.group_name?.trim();
              originByItemId[live.id] = gn ? `${rname} · ${gn}` : rname;
              return live;
            });
          return {
            sectionKey: `favg:${g.id}`,
            groupName: g.name,
            groupOrder: g.display_order,
            items,
            originByItemId,
          };
        });
    }

    const items = menuItems.filter(
      (item) => item.restaurant_id === selectedRestaurantIdResolved
    );
    const groupMap = new Map<string | null, MenuGroup>();

    for (const item of items) {
      const key = item.group_name;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          sectionKey: key === null ? "ungrouped" : `g:${key}`,
          groupName: key,
          groupOrder: item.group_order,
          items: [],
        });
      }
      groupMap.get(key)!.items.push(item);
    }

    return Array.from(groupMap.values())
      .sort((a, b) => {
        if (a.groupName === null) return -1;
        if (b.groupName === null) return 1;
        return a.groupOrder - b.groupOrder;
      });
  }, [menuItems, selectedRestaurantIdResolved, favoriteGroups, restaurantNameById]);

  const collapsibleMenuSectionKeys = useMemo(
    () => menuGroups.filter((g) => g.groupName !== null).map((g) => g.sectionKey),
    [menuGroups]
  );

  const menuGroupCollapseSessionKey = `${selectedRestaurantIdResolved}\0${collapsibleMenuSectionKeys.join("\0")}`;

  // ── カート操作 ──────────────────────────────────────────────────────────────
  function addItem(item: MenuItem, grams: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing?.kind === "menu") {
        next.set(item.id, { ...existing, count: existing.count + 1 });
      } else {
        next.set(item.id, { kind: "menu", item, count: 1, gramsPerServing: grams });
      }
      return next;
    });
  }

  function removeItem(itemId: string) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing || existing.kind !== "menu") return prev;
      if (existing.count <= 1) next.delete(itemId);
      else next.set(itemId, { ...existing, count: existing.count - 1 });
      return next;
    });
  }

  function removeCartLine(mapKey: string) {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(mapKey);
      return next;
    });
  }

  function updateGrams(itemId: string, grams: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing || existing.kind !== "menu") return prev;
      next.set(itemId, { ...existing, gramsPerServing: grams });
      return next;
    });
  }

  // ── メニューアイテム保存後 ──────────────────────────────────────────────────
  function handleItemSaved(saved: MenuItem) {
    setMenuItems((prev) => {
      const idx = prev.findIndex((m) => m.id === saved.id);
      if (idx >= 0) return prev.map((m) => m.id === saved.id ? saved : m);
      return [...prev, saved]; // 追加の場合
    });
    setFavoriteGroups((prev) =>
      prev.map((g) => ({
        ...g,
        entries: g.entries.map((e) =>
          e.menu_item_id === saved.id ? { ...e, menu_item: saved } : e
        ),
      }))
    );
    // カートにあれば item を更新（gramsPerServing はユーザーの手動編集値を保持）
    setCart((prev) => {
      const entry = prev.get(saved.id);
      if (!entry || entry.kind !== "menu") return prev;
      const next = new Map(prev);
      next.set(saved.id, { ...entry, item: saved });
      return next;
    });
  }

  function handleItemDeleted(id: string) {
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
    setFavoriteGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          entries: g.entries.filter((e) => e.menu_item_id !== id),
        }))
        .filter((g) => g.entries.length > 0)
    );
    setCart((prev) => { const next = new Map(prev); next.delete(id); return next; });
  }

  // ── お店の削除 ──────────────────────────────────────────────────────────────
  async function handleDeleteRestaurant() {
    if (!selectedRestaurant) return;
    setDeletingRestaurant(true);
    const result = await deleteRestaurant(selectedRestaurant.id);
    if (result.error) { alert(result.error); setDeletingRestaurant(false); return; }
    const rid = selectedRestaurant.id;
    const next = restaurants.filter((r) => r.id !== rid);
    setRestaurants(next);
    setMenuItems((prev) => prev.filter((m) => m.restaurant_id !== rid));
    setFavoriteGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          entries: g.entries.filter((e) => {
            const it = menuItems.find((m) => m.id === e.menu_item_id) ?? e.menu_item;
            return it.restaurant_id !== rid;
          }),
        }))
        .filter((g) => g.entries.length > 0)
    );
    setSelectedRestaurantId(next[0]?.id ?? "");
    setConfirmDeleteRestaurant(false);
    setDeletingRestaurant(false);
  }

  // ── 日付ナビ ────────────────────────────────────────────────────────────────
  async function loadDate(dateStr: string) {
    if (dateStr > today) return;
    setSelectedDate(dateStr);
    setLoadingDate(true);
    const result = await getFoodLogForDate(dateStr);
    setLoadingDate(false);
    if (!result.error) {
      setConsumedForDate(result.consumed);
      setLogEntries(result.entries);
      setShowLogEntries(dateStr !== today);
    }
  }

  async function navigateDate(delta: number) {
    const newDate = addDays(selectedDate, delta);
    await loadDate(newDate);
  }

  async function goToToday() {
    await loadDate(today);
  }

  async function refreshLogForDate(date: string) {
    const result = await getFoodLogForDate(date);
    if (!result.error) {
      setConsumedForDate(result.consumed);
      setLogEntries(result.entries);
    }
  }

  async function handleDeleteEntry(id: string) {
    const result = await deleteFoodLogEntry(id);
    if (result.error) { alert(result.error); return; }
    await refreshLogForDate(selectedDate);
  }

  // ── 食事記録保存 ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!hasCart || saving) return;
    if (
      cartEntries.some((e) => e.kind === "snapshot") &&
      !snapshotRestaurantId
    ) {
      alert(
        "スナップショット用の設定が読み込めていません。ページを再読み込みしてください。"
      );
      return;
    }
    setSaving(true);
    const items: SaveItem[] = cartEntries.map((entry) => {
      const totalGrams = entry.gramsPerServing * entry.count;
      if (entry.kind === "menu") {
        const v = pfc(entry.item, totalGrams);
        return {
          menuItemId: entry.item.id,
          name: entry.item.name,
          totalGrams,
          proteinG: v.p,
          fatG: v.f,
          carbsG: v.c,
          restaurantId: entry.item.restaurant_id,
        };
      }
      const v = pfcFromPer100(
        entry.protein_per_100g,
        entry.fat_per_100g,
        entry.carbs_per_100g,
        totalGrams
      );
      return {
        menuItemId: null,
        name: entry.name,
        totalGrams,
        proteinG: v.p,
        fatG: v.f,
        carbsG: v.c,
        restaurantId: snapshotRestaurantId,
      };
    });
    const { error } = await saveMealToLog(items, mealType, selectedDate);
    if (error) { alert(`保存に失敗しました: ${error}`); setSaving(false); return; }
    setCart(new Map());
    await refreshLogForDate(selectedDate);
    setSaving(false);
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const changelogUrl = process.env.NEXT_PUBLIC_CHANGELOG_URL;
  return (
    <>
      {/* ヘッダー */}
      <header className="flex-none flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-3 border-b border-gray-800 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <Image
            src="/icons/icon-header.png"
            alt=""
            width={160}
            height={160}
            className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full object-cover"
            sizes="(max-width: 640px) 40px, 44px"
            priority
          />
          <h1 className="text-base font-bold text-white shrink-0">
            Ketolog
          {changelogUrl ? (
            <a
              href={changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="変更履歴（Changelog）を開く"
              className="text-xs font-normal text-gray-500 ml-1.5 hover:text-gray-300 hover:underline underline-offset-2"
            >
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </a>
          ) : (
            <span className="text-xs font-normal text-gray-500 ml-1.5">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
          )}
          </h1>
        </div>
        <div className="flex-1 min-w-0 flex justify-center items-center px-1">
          {headerHint ? (
            <button
              type="button"
              onClick={() => setHeaderHintFullOpen(true)}
              className="text-center text-[11px] text-gray-400 leading-snug truncate max-w-full min-w-0 w-full rounded-md py-1 touch-manipulation active:bg-gray-800/50 sm:hover:bg-gray-800/40 transition-colors"
              title={headerHint}
              aria-label="ヘッダーメッセージの全文を表示"
              aria-haspopup="dialog"
              aria-expanded={headerHintFullOpen}
            >
              {headerHint}
            </button>
          ) : null}
        </div>
        <button onClick={() => setShowSettings(true)}
          type="button"
          className="shrink-0 text-gray-400 hover:text-white transition-colors text-base sm:text-lg leading-none min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg sm:rounded-none active:bg-gray-800/60 sm:active:bg-transparent">
          ⚙
        </button>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        {/* 日付ナビゲーション */}
        <div className="flex-none flex items-center justify-between px-1.5 sm:px-4 py-0.5 sm:py-2 border-b border-gray-800 bg-gray-900 gap-0.5 sm:gap-2">
          <button type="button" onClick={() => navigateDate(-1)} disabled={loadingDate}
            className="min-h-8 min-w-8 sm:min-h-8 sm:min-w-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 transition-colors text-base sm:text-lg rounded-md sm:rounded-none active:bg-gray-800/50 shrink-0">
            ‹
          </button>
          <div className="flex flex-row sm:flex-col flex-wrap items-center justify-center gap-x-1.5 gap-y-0 sm:gap-1 min-w-0 flex-1 px-0.5 leading-none">
            <span className="text-[13px] sm:text-sm font-medium text-white text-center leading-tight">
              {loadingDate ? "読込中..." : formatNavDate(selectedDate, today)}
            </span>
            {selectedDate !== today && !loadingDate && (
              <button
                type="button"
                onClick={() => void goToToday()}
                className="text-[10px] sm:text-[11px] text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline shrink-0 py-0 sm:py-0.5"
              >
                今日に戻る
              </button>
            )}
          </div>
          <button type="button" onClick={() => navigateDate(1)} disabled={selectedDate >= today || loadingDate}
            className="min-h-8 min-w-8 sm:min-h-8 sm:min-w-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 transition-colors text-base sm:text-lg rounded-md sm:rounded-none active:bg-gray-800/50 shrink-0">
            ›
          </button>
        </div>

        {/* PFCバー */}
        <div className="flex-none px-3 sm:px-4 py-1.5 sm:py-3 bg-gray-900 border-b border-gray-800 space-y-1 sm:space-y-1.5">
          <PFCBar label="P" current={totalPFC.p} target={currentSettings.protein_target_g} color={MACRO_BAR_BG.p} />
          <PFCBar label="F" current={totalPFC.f} target={currentSettings.fat_target_g}     color={MACRO_BAR_BG.f} />
          <PFCBar label="C" current={totalPFC.c} target={currentSettings.carbs_target_g}   color={MACRO_BAR_BG.c} />
        </div>

        {/* 記録済みパネル */}
        {logEntries.length > 0 && (
          <div className="flex-none border-b border-gray-800">
            <button
              type="button"
              aria-expanded={showLogEntries}
              onClick={() => setShowLogEntries((v) => !v)}
              className="w-full flex items-center justify-end gap-2 px-3 sm:px-4 py-1 sm:py-2 text-[11px] sm:text-xs text-gray-400 hover:text-white transition-colors min-h-7 sm:min-h-0 leading-none"
            >
              <span className="font-medium text-gray-300 text-right">
                この日の記録（{logEntries.length}件）
              </span>
              <span className="text-gray-500 shrink-0 w-5 text-center" aria-hidden>
                {showLogEntries ? "▲" : "▼"}
              </span>
            </button>
            {showLogEntries && (
              <div className="max-h-60 overflow-y-auto">
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((mt) => {
                  const items = logEntries.filter((e) => e.meal_type === mt);
                  if (!items.length) return null;
                  return (
                    <div key={mt}>
                      <p className="px-3 sm:px-4 py-px sm:py-0.5 text-[11px] sm:text-xs text-gray-500 bg-gray-900/50 leading-none">{MEAL_LABELS[mt]}</p>
                      {items.map((entry) => (
                        <LogEntryRow
                          key={entry.id}
                          entry={entry}
                          onEdit={() => setEditingEntry(entry)}
                          onDelete={() => handleDeleteEntry(entry.id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 食事タイプ タブ＋記録（＋は選択中の区分でドロワーを開く） */}
        <div className="flex-none flex items-stretch border-b border-gray-800 bg-gray-900">
          <div className="flex flex-1 min-w-0">
            {(Object.keys(MEAL_LABELS) as MealType[]).map((type) => {
              const active = mealType === type;
              const a = MEAL_TAB_STYLES[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMealType(type)}
                  className={`flex-1 min-w-0 min-h-9 sm:min-h-0 py-1.5 sm:py-2.5 text-xs font-medium border-b-2 transition-colors text-center touch-manipulation ${
                    active
                      ? `${a.row} ${a.label}`
                      : "border-transparent text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {MEAL_LABELS[type]}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={`${MEAL_LABELS[mealType]}に記録を追加（いま選んでいる食事区分で開きます）`}
            onClick={() => {
              const rid = menuAddRestaurantId;
              if (!rid) {
                alert(
                  "表示できるお店がありません。上の「＋」からお店を追加してください。"
                );
                return;
              }
              setItemDrawer({ kind: "add", restaurantId: rid, openedAt: Date.now() });
            }}
            className="shrink-0 min-w-[3rem] w-[3rem] sm:min-w-11 sm:w-11 flex items-center justify-center text-[1.35rem] sm:text-xl font-semibold leading-none touch-manipulation border-l border-gray-800/80 transition-colors bg-emerald-600/25 text-emerald-200 hover:bg-emerald-500/45 hover:text-white active:bg-emerald-500/55"
          >
            ＋
          </button>
        </div>

        {/* レストラン タブ + 追加ボタン（左ハンドルで並べ替え） */}
        <div className="flex-none flex border-b border-gray-800 overflow-x-auto [scrollbar-gutter:stable] pl-[max(0px,env(safe-area-inset-left))] pr-[max(0px,env(safe-area-inset-right))] items-stretch">
          <button
            type="button"
            onClick={() => {
              setSelectedRestaurantId(FAVORITES_TAB_ID);
              setConfirmDeleteRestaurant(false);
            }}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors min-h-9 sm:min-h-0 touch-manipulation ${
              selectedRestaurantIdResolved === FAVORITES_TAB_ID
                ? "border-amber-500 text-amber-100"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            お気に入り
          </button>
          <button
            type="button"
            title={STANDARD_FOOD_TAB_TITLE}
            onClick={() => {
              if (tabRestaurants.length === 0) {
                alert(
                  "先にお店を追加してください。上の「＋」からお店を登録できます。"
                );
                return;
              }
              if (
                selectedRestaurantIdResolved !== FAVORITES_TAB_ID &&
                selectedRestaurantIdResolved !== MEXT_COMPOSITION_TAB_ID
              ) {
                setCompositionTargetRestaurantId(selectedRestaurantIdResolved);
              }
              setConfirmDeleteRestaurant(false);
              setSelectedRestaurantId(MEXT_COMPOSITION_TAB_ID);
            }}
            className={`px-2 sm:px-3 py-1.5 sm:py-2.5 text-[11px] sm:text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors min-h-9 sm:min-h-0 touch-manipulation max-w-[9.5rem] sm:max-w-none ${
              selectedRestaurantIdResolved === MEXT_COMPOSITION_TAB_ID
                ? "border-sky-500 text-sky-100"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="sm:hidden">成分表</span>
            <span className="hidden sm:inline truncate block">
              文科省表2023
            </span>
          </button>
          <DndContext
            sensors={restaurantSensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void handleRestaurantDragEnd(e)}
          >
            <SortableContext items={tabRestaurantIds} strategy={horizontalListSortingStrategy}>
              {tabRestaurants.map((r) => (
                <SortableRestaurantTab
                  key={r.id}
                  restaurant={r}
                  selected={selectedRestaurantIdResolved === r.id}
                  onSelect={() => {
                    setSelectedRestaurantId(r.id);
                    setConfirmDeleteRestaurant(false);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button type="button" onClick={() => setRestaurantAddSheet("choice")}
            className="px-2.5 py-1.5 sm:py-2.5 min-w-9 sm:min-w-11 text-gray-500 hover:text-white shrink-0 transition-colors text-lg sm:text-lg leading-none flex items-center justify-center self-center">
            ＋
          </button>
        </div>

        {/* メニューリスト / 成分表パネル */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {selectedRestaurantIdResolved === MEXT_COMPOSITION_TAB_ID ? (
            <StandardFoodPanel
              visibleRestaurants={tabRestaurants}
              compositionTargetRestaurantId={resolvedCompositionTargetId}
              onCompositionTargetChange={setCompositionTargetRestaurantId}
              onPickFood={(row) => {
                const rid = resolvedCompositionTargetId;
                if (!rid) return;
                const back = lastRealRestaurantTabIdRef.current;
                const safeBack =
                  back &&
                  back !== MEXT_COMPOSITION_TAB_ID &&
                  back !== FAVORITES_TAB_ID
                    ? back
                    : rid;
                setSelectedRestaurantId(safeBack);
                setItemDrawer({
                  kind: "add",
                  restaurantId: rid,
                  openedAt: Date.now(),
                  standardFoodDraft: {
                    food_code: row.food_code,
                    name: row.name,
                    protein_per_100g: row.protein_per_100g,
                    fat_per_100g: row.fat_per_100g,
                    carbs_per_100g: row.carbs_per_100g,
                  },
                });
              }}
            />
          ) : (
            <>
          <MenuGroupCollapseSession
            key={menuGroupCollapseSessionKey}
            selectedRestaurantIdResolved={selectedRestaurantIdResolved}
            collapsibleMenuSectionKeys={collapsibleMenuSectionKeys}
          >
            {({ collapsedGroups, toggleMenuGroupCollapsed }) => (
              <>
          {menuGroups.map((group) => {
            if (group.groupName === null) {
              return group.items.map((item) => (
                <MenuItemRow
                  key={`${item.id}-${item.default_grams}`}
                  item={item}
                  entry={cart.get(item.id)}
                  onAdd={(g) => addItem(item, g)}
                  onRemove={() => removeItem(item.id)}
                  onChangeGrams={(g) => updateGrams(item.id, g)}
                  onEdit={() => setItemDrawer({ kind: "edit", item })}
                  onToggleFavorite={() => void handleToggleFavorite(item)}
                  isFavorited={favoriteMenuItemIds.has(item.id)}
                  pfcTargets={{
                    protein_target_g: currentSettings.protein_target_g,
                    fat_target_g: currentSettings.fat_target_g,
                  }}
                />
              ));
            }
            const isCollapsed = collapsedGroups.has(group.sectionKey);
            const cartCount = group.items.reduce((n, item) => n + (cart.get(item.id)?.count ?? 0), 0);
            return (
              <div key={group.sectionKey}>
                <button
                  onClick={() => toggleMenuGroupCollapsed(group.sectionKey)}
                  type="button"
                  className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2 text-gray-400 text-xs sm:text-xs bg-gray-900/50 border-b border-gray-800/60 hover:text-gray-200 transition-colors min-h-9 sm:min-h-0">
                  <span className="flex items-center gap-1.5">
                    <span>{isCollapsed ? "▶" : "▼"}</span>
                    <span>{group.groupName}（{group.items.length}品）</span>
                    {isCollapsed && cartCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-emerald-600 text-white rounded-full text-xs leading-none">{cartCount}</span>
                    )}
                  </span>
                </button>
                {!isCollapsed && group.items.map((item) => (
                  <MenuItemRow
                    key={`${item.id}-${item.default_grams}`}
                    item={item}
                    entry={cart.get(item.id)}
                    onAdd={(g) => addItem(item, g)}
                    onRemove={() => removeItem(item.id)}
                    onChangeGrams={(g) => updateGrams(item.id, g)}
                    onEdit={() => setItemDrawer({ kind: "edit", item })}
                    onToggleFavorite={() => void handleToggleFavorite(item)}
                    isFavorited={favoriteMenuItemIds.has(item.id)}
                    originCaption={group.originByItemId?.[item.id] ?? null}
                    pfcTargets={{
                      protein_target_g: currentSettings.protein_target_g,
                      fat_target_g: currentSettings.fat_target_g,
                    }}
                  />
                ))}
              </div>
            );
          })}
              </>
            )}
          </MenuGroupCollapseSession>

          {/* メニュー追加 & お店削除 */}
          {selectedRestaurantIdResolved &&
            selectedRestaurantIdResolved !== FAVORITES_TAB_ID && (
            <div className="px-4 py-3 space-y-2 border-t border-gray-800/60 mt-1">
              <button
                onClick={() =>
                  setItemDrawer({
                    kind: "add",
                    restaurantId: selectedRestaurantIdResolved,
                    openedAt: Date.now(),
                  })
                }
                className="w-full py-2 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors">
                ＋ メニューを追加
              </button>

              {/* エクスポート・インポート */}
              {selectedRestaurant && (
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadRestaurantJson(selectedRestaurant, menuItems)}
                    className="flex-1 py-1.5 text-gray-500 hover:text-white text-xs transition-colors border border-gray-800 rounded-lg">
                    JSONでエクスポート
                  </button>
                  <button
                    onClick={() => setShowImportMenuItems(true)}
                    className="flex-1 py-1.5 text-gray-500 hover:text-white text-xs transition-colors border border-gray-800 rounded-lg">
                    JSONでメニューを追加
                  </button>
                </div>
              )}

              {selectedRestaurant && (
                confirmDeleteRestaurant ? (
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDeleteRestaurant(false)}
                      className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm">
                      キャンセル
                    </button>
                    <button onClick={handleDeleteRestaurant} disabled={deletingRestaurant}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                      {deletingRestaurant ? "削除中..." : "削除する"}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteRestaurant(true)}
                    className="w-full py-1.5 text-red-400 hover:text-red-300 text-xs transition-colors">
                    このお店を削除
                  </button>
                )
              )}
            </div>
          )}

          {menuGroups.every((g) => g.items.length === 0) &&
            selectedRestaurantIdResolved === FAVORITES_TAB_ID && (
            <p className="text-center text-gray-500 text-base sm:text-sm py-8 px-4">
              お気に入りはまだありません。各メニューの☆をタップすると、ここに集約されます。
            </p>
          )}
          {menuGroups.every((g) => g.items.length === 0) &&
            selectedRestaurantIdResolved &&
            selectedRestaurantIdResolved !== FAVORITES_TAB_ID && (
            <p className="text-center text-gray-500 text-base sm:text-sm py-8">
              メニューがまだありません
            </p>
          )}
            </>
          )}
        </div>

        {/* カート: sm+ は従来どおりインライン展開。未満は折りたたみバー＋展開時オーバーレイ（メニュー領域を確保） */}
        {hasCart && (
          <>
            <div
              className={`sm:hidden flex-none pb-[env(safe-area-inset-bottom)] ${MEAL_CART_SHELL[mealType]} ${cartExpanded ? "hidden" : ""}`}
            >
              <CartBarHeader
                cartExpanded={cartExpanded}
                onToggle={() => setCartExpanded((v) => !v)}
                cartEntryCount={cartEntries.length}
                cartPFC={cartPFC}
                mealType={mealType}
              />
            </div>

            {cartExpanded && (
              <div
                className="sm:hidden fixed inset-0 z-[38] flex flex-col justify-end pointer-events-none"
                role="dialog"
                aria-modal="true"
                aria-label="カートの詳細"
              >
                <button
                  type="button"
                  className="pointer-events-auto absolute inset-0 border-0 bg-black/50"
                  aria-label="カートを閉じる"
                  onClick={() => setCartExpanded(false)}
                />
                <div
                  className={`pointer-events-auto relative z-[1] flex max-h-[min(85svh,560px)] flex-col rounded-t-2xl border-x border-t border-gray-700 ${MEAL_CART_SHELL[mealType]} pb-[env(safe-area-inset-bottom)] max-w-md mx-auto w-full min-h-0`}
                >
                  <div className="flex-none flex justify-center pt-2 pb-1">
                    <div className="w-10 h-1 rounded-full bg-gray-600" aria-hidden />
                  </div>
                  <CartBarHeader
                    cartExpanded={cartExpanded}
                    onToggle={() => setCartExpanded((v) => !v)}
                    cartEntryCount={cartEntries.length}
                    cartPFC={cartPFC}
                    mealType={mealType}
                  />
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <CartExpandedBody
                      layout="sheet"
                      mealType={mealType}
                      setMealType={setMealType}
                      cartEntries={cartEntries}
                      cartPFC={cartPFC}
                      removeCartLine={removeCartLine}
                      onSave={handleSave}
                      saving={saving}
                    />
                  </div>
                </div>
              </div>
            )}

            <div
              className={`hidden sm:flex sm:flex-none sm:flex-col sm:pb-[env(safe-area-inset-bottom)] ${MEAL_CART_SHELL[mealType]}`}
            >
              <CartBarHeader
                cartExpanded={cartExpanded}
                onToggle={() => setCartExpanded((v) => !v)}
                cartEntryCount={cartEntries.length}
                cartPFC={cartPFC}
                mealType={mealType}
              />
              {cartExpanded && (
                <CartExpandedBody
                  mealType={mealType}
                  setMealType={setMealType}
                  cartEntries={cartEntries}
                  cartPFC={cartPFC}
                  removeCartLine={removeCartLine}
                  onSave={handleSave}
                  saving={saving}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* メニュー追加・編集ドロワー */}
      {itemDrawer && (
        <MenuItemDrawer
          key={
            itemDrawer.kind === "edit"
              ? `edit:${itemDrawer.item.id}`
              : `add:${itemDrawer.openedAt}`
          }
          state={itemDrawer}
          existingGroupNames={existingGroupNamesForDrawer}
          onClose={() => setItemDrawer(null)}
          onSaved={handleItemSaved}
          onDeleted={itemDrawer.kind === "edit" ? handleItemDeleted : undefined}
          mealTypeForLog={
            itemDrawer.kind === "add" && itemDrawer.logMealType != null
              ? itemDrawer.logMealType
              : mealType
          }
          logDate={selectedDate}
          snapshotRestaurantId={snapshotRestaurantId}
          registerTargetRestaurantName={
            itemDrawer.kind === "add"
              ? (restaurantNameById.get(itemDrawer.restaurantId) ?? "")
              : selectedRestaurantIdResolved === FAVORITES_TAB_ID
                ? (tabRestaurants[0]?.name ?? "")
                : (selectedRestaurant?.name ?? "")
          }
          onOpenStandardFoodSearch={
            itemDrawer.kind === "add"
              ? () => {
                  if (tabRestaurants.length === 0) {
                    alert(
                      "先にお店を追加してください。上の「＋」からお店を登録できます。"
                    );
                    return;
                  }
                  setCompositionTargetRestaurantId(itemDrawer.restaurantId);
                  setItemDrawer(null);
                  setSelectedRestaurantId(MEXT_COMPOSITION_TAB_ID);
                }
              : undefined
          }
          onAfterSnapshotLog={() => refreshLogForDate(selectedDate)}
          onSnapshotCart={(draft) => {
            const cartKey = `snap:${crypto.randomUUID()}`;
            setCart((prev) => {
              const next = new Map(prev);
              next.set(cartKey, {
                kind: "snapshot",
                cartKey,
                name: draft.name,
                protein_per_100g: draft.protein_per_100g,
                fat_per_100g: draft.fat_per_100g,
                carbs_per_100g: draft.carbs_per_100g,
                gramsPerServing: draft.grams,
                count: 1,
                shared_barcode: draft.shared_barcode,
              });
              return next;
            });
          }}
        />
      )}

      {/* お店追加: 選択シート */}
      {restaurantAddSheet === "choice" && (
        <RestaurantAddChoiceSheet
          onManual={() => setRestaurantAddSheet("manual")}
          onImport={() => setRestaurantAddSheet("import")}
          onPreset={() => setRestaurantAddSheet("preset")}
          onClose={() => setRestaurantAddSheet(null)}
        />
      )}

      {/* お店追加: 手入力 */}
      {restaurantAddSheet === "manual" && (
        <AddRestaurantDrawer
          onClose={() => setRestaurantAddSheet(null)}
          onAdded={(r) => {
            setRestaurants((prev) => sortRestaurants([...prev, r]));
            setSelectedRestaurantId(r.id);
            setRestaurantAddSheet(null);
          }}
        />
      )}

      {/* お店追加: JSONインポート */}
      {restaurantAddSheet === "import" && (
        <ImportRestaurantDrawer
          onClose={() => setRestaurantAddSheet(null)}
          onImported={(restaurant, items) => {
            setRestaurants((prev) => sortRestaurants([...prev, restaurant]));
            setMenuItems((prev) => [...prev, ...items]);
            setSelectedRestaurantId(restaurant.id);
            setRestaurantAddSheet(null);
          }}
        />
      )}

      {/* お店追加: プリセット */}
      {restaurantAddSheet === "preset" && (
        <PresetSelectDrawer
          presets={presets}
          onClose={() => setRestaurantAddSheet(null)}
          onImported={(restaurant, items) => {
            setRestaurants((prev) => sortRestaurants([...prev, restaurant]));
            setMenuItems((prev) => [...prev, ...items]);
            setSelectedRestaurantId(restaurant.id);
            setRestaurantAddSheet(null);
          }}
        />
      )}

      {/* 既存お店へのJSONメニュー追加 */}
      {showImportMenuItems && selectedRestaurant && (
        <ImportMenuItemsDrawer
          restaurant={selectedRestaurant}
          onClose={() => setShowImportMenuItems(false)}
          onImported={(items) => {
            setMenuItems((prev) => [...prev, ...items]);
            setShowImportMenuItems(false);
          }}
        />
      )}

      {/* 食事ログ エントリ編集 */}
      {editingEntry && (
        <EditEntryDrawer
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={() => refreshLogForDate(selectedDate)}
        />
      )}

      {/* ヘッダーヒント全文 */}
      {headerHint && headerHintFullOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setHeaderHintFullOpen(false)}
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
                onClick={() => setHeaderHintFullOpen(false)}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </>
      )}

      {/* 設定ドロワー */}
      {showSettings && (
        <SettingsDrawer
          settings={currentSettings}
          restaurants={restaurants}
          menuItems={menuItems}
          onClose={() => setShowSettings(false)}
          onSaved={(updated) => setCurrentSettings(updated)}
        />
      )}
    </>
  );
}
