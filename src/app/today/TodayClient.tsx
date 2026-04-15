"use client";

import Link from "next/link";
import {
  useState,
  useMemo,
  useRef,
  useId,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import type {
  FoodLogEntry,
  MenuItem,
  Restaurant,
  UserSettings,
  TodayConsumed,
  FavoriteGroupPayload,
} from "@/types/database";
import {
  activePhaseProfile,
  type DietPhase,
  type PhaseProfiles,
} from "@/lib/diet-phase";
import type { MealType } from "@/lib/meal-timezone";
import { sumPfc, type PfcGrams } from "@/lib/pfc";
import { isSnapshotRestaurant } from "@/lib/snapshot-restaurant";
import { RESTAURANT_NAME_MAX_LENGTH } from "@/lib/restaurant-limits";
import { createClient } from "@/lib/supabase/client";
import {
  addMenuItem,
  addMenuItemWithManualSharedProduct,
  deleteMenuItem,
  lookupSharedProductByBarcode,
  updateMenuItem,
  type MenuItemUpdate,
} from "./actions/menu-item";
import { addRestaurant } from "./actions/restaurant";
import {
  importMenuItemsToRestaurant,
  importRestaurantData,
  type ImportRestaurantItem,
} from "./actions/import-export";
import {
  getFoodLogForExport,
  saveMealToLog,
  updateFoodLogEntry,
  type FoodLogExportEntry,
  type SaveItem,
} from "./actions/food-log";
import { updateUserSettings } from "./actions/settings";
import type { SharedProduct } from "@/types/database";
import {
  MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES,
  SHARED_PRODUCT_SOURCE_MANUAL_ENTRY,
} from "@/lib/shared-product-source";
import { computeHeaderHintText, getActiveHintSlot } from "@/lib/header-hint";
import { useAppUpdateBanner } from "@/hooks/useAppUpdateBanner";
import { buildMenuQrPayloadJson, parseMenuSharePayload } from "@/lib/menu-qr-payload";
import { MEAL_LABELS, MEAL_TAB_STYLES } from "@/lib/constants/meal";
import { PfcHeader } from "./_components/PfcHeader";
import { BarcodeScanner } from "./_components/BarcodeScanner";
import { CartPanel, type CartEntry } from "./_components/CartPanel";
import { MenuItemList } from "./_components/MenuItemList";
import { RestaurantPanel } from "./_components/RestaurantPanel";
import { formatNavDate, useMealLog } from "./_hooks/useMealLog";
import {
  FAVORITES_TAB_ID,
  MEXT_COMPOSITION_TAB_ID,
  useRestaurantState,
} from "./_hooks/useRestaurantState";
import { TAB_CONTEXT_MENU_H, TAB_CONTEXT_MENU_W } from "./ui-constants";

// ─── 型 ────────────────────────────────────────────────────────────────────────

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
  registerTargets,
  registerTargetRestaurantId,
  onRegisterTargetChange,
  registerTargetRestaurantName,
  canRegisterMenu,
  registerDisabledReason,
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
  /** 追加時: メニュー登録先が有効なとき true */
  canRegisterMenu: boolean;
  /** 追加時: メニュー登録を無効化する理由 */
  registerDisabledReason?: string;
  onAfterSnapshotLog: () => Promise<void>;
  onSnapshotCart: (draft: {
    name: string;
    protein_per_100g: number | null;
    fat_per_100g: number | null;
    carbs_per_100g: number | null;
    grams: number;
    shared_barcode: string | null;
  }) => void;
  registerTargets: Restaurant[];
  registerTargetRestaurantId: string;
  onRegisterTargetChange: (restaurantId: string) => void;
  onOpenStandardFoodSearch?: () => void;
}) {
  const MEMO_MIN_ROWS = 3;
  const MEMO_MAX_ROWS = 10;
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
  const [mode, setMode]       = useState<NutrientMode>("perServing");
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
  /** OFF 未ヒット後に保存すると RPC で shared_products へ載せる（Issue #191） */
  const [manualSharedProductPending, setManualSharedProductPending] = useState(false);
  const [lastLookup, setLastLookup] = useState<{ barcode: string; at: number } | null>(null);
  const [servingHint, setServingHint] = useState<string | null>(null);
  const [shareQrDataUrl, setShareQrDataUrl] = useState<string | null>(null);
  const [shareQrError, setShareQrError] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  /** QR 共有メニューの取り込み成功（ドロワーを閉じずに表示） */
  const [menuQrImportDone, setMenuQrImportDone] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const groupNameInputRef = useRef<HTMLInputElement>(null);
  const groupSuggestionWrapRef = useRef<HTMLDivElement>(null);
  const groupSuggestionTriggerRef = useRef<"pointer" | "keyboard" | "unknown">("unknown");
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isGroupSuggestionsOpen, setIsGroupSuggestionsOpen] = useState(false);
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

  const lookupOffProductBarcode = useCallback(
    async (rawBarcode: string) => {
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
      if (res.status === "error") {
        setManualSharedProductPending(false);
        setScanError(res.error ?? "バーコードの照会に失敗しました");
        return;
      }
      if (res.status === "not_found" || !res.product) {
        setCameraResult(null);
        setServingHint(null);
        setSharedBarcode(normalized);
        setStandardFoodCode(null);
        setManualSharedProductPending(true);
        setScanError(
          "Open Food Facts にこのバーコードはありませんでした。商品名と栄養を入力して保存すると、アプリ内で共有されます（写真は不要です）。"
        );
        return;
      }
      setManualSharedProductPending(false);
      setScanError(null);
      setCameraResult(res.product);
      setSharedBarcode(res.product.barcode);
      setStandardFoodCode(null);
      setName(res.product.product_name);
      setProtein(res.product.protein_per_100g?.toString() ?? "");
      setFat(res.product.fat_per_100g?.toString() ?? "");
      setCarbs(res.product.carbs_per_100g?.toString() ?? "");
      if (res.product.serving_size_grams && res.product.serving_size_grams > 0) {
        setGrams(res.product.serving_size_grams.toString());
        setServingHint(
          `OFFの serving_size (${res.product.serving_size}) を1回量に仮入力しました。ラベルで必ず確認してください。`
        );
      } else if (res.product.serving_size) {
        setServingHint(
          `OFFの serving_size (${res.product.serving_size}) を取得しました。1回量(g)を手動で確認してください。`
        );
      } else {
        setServingHint(null);
      }
      if (!notes.trim()) {
        if (res.product.source === SHARED_PRODUCT_SOURCE_MANUAL_ENTRY) {
          setNotes(MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES);
        } else {
          setNotes(res.product.brand ? `OFF: ${res.product.brand}` : "OFF連携");
        }
      }
    },
    [lastLookup, notes]
  );

  const importItemPreviewForQr = useMemo((): ImportRestaurantItem | null => {
    if (!isEdit) return null;
    if (!name.trim()) return null;
    const gramsNum = parseFloat(grams) || 100;
    const p = protein === "" ? null : parseFloat(protein);
    const f = fat === "" ? null : parseFloat(fat);
    const c = carbs === "" ? null : parseFloat(carbs);
    return {
      name: name.trim(),
      protein_per_100g: p !== null && Number.isFinite(p) ? p : null,
      fat_per_100g: f !== null && Number.isFinite(f) ? f : null,
      carbs_per_100g: c !== null && Number.isFinite(c) ? c : null,
      shared_barcode: sharedBarcode,
      standard_food_code: standardFoodCode,
      default_grams: gramsNum,
      rank,
      notes: notes.trim() || null,
      group: groupName.trim() || null,
    };
  }, [
    isEdit,
    name,
    protein,
    fat,
    carbs,
    grams,
    rank,
    notes,
    groupName,
    sharedBarcode,
    standardFoodCode,
  ]);

  useEffect(() => {
    if (!isEdit) {
      setShareQrDataUrl(null);
      setShareQrError(null);
      return;
    }
    if (!importItemPreviewForQr) {
      setShareQrDataUrl(null);
      setShareQrError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const json = buildMenuQrPayloadJson(importItemPreviewForQr);
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(json, {
          errorCorrectionLevel: "L",
          margin: 1,
          width: 220,
          color: { dark: "#000000ff", light: "#ffffffff" },
        });
        if (!cancelled) {
          setShareQrDataUrl(url);
          setShareQrError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setShareQrDataUrl(null);
          setShareQrError(
            e instanceof Error
              ? `QRを生成できませんでした（${e.message}）。メモや名前を短くするか、項目を減らして保存内容を試してください。`
              : "QRを生成できませんでした。メモや名前を短くしてください。"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, importItemPreviewForQr]);

  /** メニュー共有 QR のペイロードを「メニューを追加」フォームへ転記（DB 保存はメニューに登録などで行う） */
  const applyImportRestaurantItemToForm = useCallback((item: ImportRestaurantItem) => {
    setName(item.name);
    setProtein(
      item.protein_per_100g === null || item.protein_per_100g === undefined
        ? ""
        : String(item.protein_per_100g)
    );
    setFat(
      item.fat_per_100g === null || item.fat_per_100g === undefined ? "" : String(item.fat_per_100g)
    );
    setCarbs(
      item.carbs_per_100g === null || item.carbs_per_100g === undefined
        ? ""
        : String(item.carbs_per_100g)
    );
    setGrams(String(item.default_grams));
    setRank(item.rank);
    setGroupName(item.group ?? "");
    setNotes(item.notes ?? "");
    setSharedBarcode(item.shared_barcode ?? null);
    setStandardFoodCode(item.standard_food_code ?? null);
    setManualSharedProductPending(false);
    setCameraResult(null);
    setServingHint(null);
    setScanError(null);
    setError(null);
    setMode("perServing");
    setRawP(null);
    setRawF(null);
    setRawC(null);
    setLastLookup(null);
  }, []);

  const handleDecodedScan = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setScanError("バーコードを読み取れませんでした。もう一度お試しください。");
        return;
      }
      if (/^https?:\/\//i.test(trimmed)) {
        setCameraOn(false);
        setScanLoading(false);
        setScanError("URLからの取り込みは、まだ対応していません。");
        return;
      }
      if (trimmed.startsWith("{")) {
        const parsed = parseMenuSharePayload(trimmed);
        if (!parsed.ok) {
          setCameraOn(false);
          setScanLoading(false);
          setScanError(parsed.error);
          return;
        }
        if (!canRegisterMenu) {
          setCameraOn(false);
          setScanLoading(false);
          setScanError(registerDisabledReason ?? "追加先のお店がありません。");
          return;
        }
        setCameraOn(false);
        setScanLoading(false);
        setMenuQrImportDone(null);
        applyImportRestaurantItemToForm(parsed.item);
        setMenuQrImportDone(`「${parsed.item.name}」をフォームに反映しました。`);
        requestAnimationFrame(() => nameInputRef.current?.focus());
        return;
      }
      await lookupOffProductBarcode(trimmed);
    },
    [canRegisterMenu, registerDisabledReason, applyImportRestaurantItemToForm, lookupOffProductBarcode]
  );

  const closeBarcodeCamera = useCallback(() => {
    setCameraOn(false);
  }, []);

  const reportBarcodeRuntimeError = useCallback((message: string) => {
    setScanError(message);
  }, []);

  const toggleBarcodeScan = useCallback(() => {
    if (!cameraOn && !cameraSupported) {
      setScanError(
        "この環境ではカメラを利用できません。HTTPS で開いているか、ブラウザのカメラ権限を確認してください。"
      );
      return;
    }
    setScanError(null);
    setCameraResult(null);
    setServingHint(null);
    setMenuQrImportDone(null);
    setCameraOn((v) => !v);
  }, [cameraOn, cameraSupported]);

  useEffect(() => {
    if (isEdit) return;
    const id = requestAnimationFrame(() => {
      if (!window.matchMedia("(min-width: 640px)").matches) return;
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isEdit]);

  useLayoutEffect(() => {
    const textarea = notesTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 20;
    const maxHeight = lineHeight * MEMO_MAX_ROWS;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [notes]);

  useEffect(() => {
    if (!isGroupSuggestionsOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (groupSuggestionWrapRef.current?.contains(target)) return;
      setIsGroupSuggestionsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isGroupSuggestionsOpen]);

  const groupSuggestions = existingGroupNames;

  function openGroupSuggestions(shouldFocusInput = false) {
    if (shouldFocusInput) groupNameInputRef.current?.focus();
    setIsGroupSuggestionsOpen((v) => !v);
  }

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
      if (!canRegisterMenu) {
        setError(registerDisabledReason ?? "追加先のお店がないため、メニュー登録できません。");
        setSaving(false);
        return;
      }
      const restaurantId = state.kind === "add" ? state.restaurantId : "";
      const result =
        manualSharedProductPending && sharedBarcode
          ? await addMenuItemWithManualSharedProduct(restaurantId, sharedBarcode, data)
          : await addMenuItem(restaurantId, data);
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
            <BarcodeScanner
              cameraSupported={cameraSupported}
              cameraOn={cameraOn}
              onToggleScan={toggleBarcodeScan}
              scanLoading={scanLoading}
              scanError={scanError}
              cameraResult={cameraResult}
              menuQrImportDone={menuQrImportDone}
              manualSharedProductPending={manualSharedProductPending}
              sharedBarcode={sharedBarcode}
              servingHint={servingHint}
              onDecoded={handleDecodedScan}
              onRuntimeError={reportBarcodeRuntimeError}
              onCameraClosed={closeBarcodeCamera}
              onOpenStandardFoodSearch={onOpenStandardFoodSearch}
            />
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
            <div ref={groupSuggestionWrapRef} className="relative">
              <div className="flex items-center gap-2">
              <input
                ref={groupNameInputRef}
                type="text"
                value={groupName}
                onChange={(e) => {
                  setGroupName(e.target.value);
                  if (!isGroupSuggestionsOpen) setIsGroupSuggestionsOpen(true);
                }}
                placeholder="例: ホルモン系"
                className="min-w-0 flex-1 px-3 py-2.5 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500"
              />
              {existingGroupNames.length > 0 && (
                <button
                  type="button"
                  onPointerDown={() => {
                    groupSuggestionTriggerRef.current = "pointer";
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      groupSuggestionTriggerRef.current = "keyboard";
                    }
                  }}
                  onClick={() => {
                    openGroupSuggestions(groupSuggestionTriggerRef.current === "keyboard");
                    groupSuggestionTriggerRef.current = "unknown";
                  }}
                  className="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 transition-colors hover:border-gray-600 hover:text-white"
                >
                  候補
                </button>
              )}
            </div>
              {existingGroupNames.length > 0 && isGroupSuggestionsOpen && (
                <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/95 p-1 shadow-lg">
                  {groupSuggestions.length > 0 ? (
                    groupSuggestions.map((g) => (
                      <li key={g}>
                        <button
                          type="button"
                          onClick={() => {
                            setGroupName(g);
                            setIsGroupSuggestionsOpen(false);
                          }}
                          className="w-full rounded-md px-2 py-2 text-left text-sm text-gray-100 hover:bg-gray-800"
                        >
                          {g}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-2 py-2 text-xs text-gray-400">一致する候補はありません</li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">メモ（任意）</label>
            <textarea
              ref={notesTextareaRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={MEMO_MIN_ROWS}
              placeholder="例: 1切れ約15g"
              className="w-full resize-none px-3 py-2.5 sm:py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {isEdit && (
            <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-3">
              <p className="text-xs text-gray-400">共有（QR）</p>
              <p className="text-[11px] leading-snug text-gray-500">
                入力中の内容を QR にします。相手は「メニューを追加」からカメラで読み取れます。
              </p>
              {!importItemPreviewForQr && (
                <p className="text-xs text-amber-300">名前を入力すると QR を表示できます。</p>
              )}
              {shareQrError && <p className="text-xs text-amber-300">{shareQrError}</p>}
              {shareQrDataUrl && importItemPreviewForQr && (
                <>
                  <div className="flex justify-center rounded-lg bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL from qrcode */}
                    <img
                      src={shareQrDataUrl}
                      alt=""
                      width={220}
                      height={220}
                      className="h-44 w-44 max-w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        if (!shareQrDataUrl) return;
                        const slug =
                          name
                            .trim()
                            .replace(/[\\/:*?"<>|]+/g, "_")
                            .slice(0, 48) || "menu";
                        const a = document.createElement("a");
                        a.href = shareQrDataUrl;
                        a.download = `ketolog-menu-${slug}.png`;
                        a.click();
                        setShareToast({ tone: "ok", msg: "PNG を保存しました" });
                        window.setTimeout(() => setShareToast(null), 2800);
                      }}
                      className="flex-1 rounded-lg bg-gray-800 py-2.5 text-center text-sm text-gray-200 transition-colors hover:bg-gray-700"
                    >
                      PNG を保存
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          if (!shareQrDataUrl) return;
                          try {
                            const res = await fetch(shareQrDataUrl);
                            const blob = await res.blob();
                            if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
                              setShareToast({
                                tone: "err",
                                msg: "このブラウザでは画像のコピーに対応していない可能性があります。",
                              });
                              window.setTimeout(() => setShareToast(null), 4000);
                              return;
                            }
                            await navigator.clipboard.write([
                              new ClipboardItem({ [blob.type]: blob }),
                            ]);
                            setShareToast({
                              tone: "ok",
                              msg: "画像をコピーしました（LINE などに貼り付けできます）",
                            });
                            window.setTimeout(() => setShareToast(null), 3500);
                          } catch {
                            setShareToast({ tone: "err", msg: "画像のコピーに失敗しました。" });
                            window.setTimeout(() => setShareToast(null), 4000);
                          }
                        })();
                      }}
                      className="flex-1 rounded-lg border border-gray-600 py-2.5 text-center text-sm text-gray-200 transition-colors hover:border-gray-500"
                    >
                      画像をコピー
                    </button>
                  </div>
                </>
              )}
              {shareToast && (
                <p
                  className={
                    shareToast.tone === "ok" ? "text-xs text-emerald-300" : "text-xs text-amber-300"
                  }
                >
                  {shareToast.msg}
                </p>
              )}
            </div>
          )}

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
                <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-3 py-2">
                  <label className="mb-1 block text-[11px] text-gray-400">メニュー登録先</label>
                  <select
                    value={canRegisterMenu ? registerTargetRestaurantId : ""}
                    onChange={(e) => onRegisterTargetChange(e.target.value)}
                    disabled={registerTargets.length === 0}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    {registerTargets.length === 0 ? (
                      <option value="">お店がありません</option>
                    ) : (
                      registerTargets.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !canRegisterMenu}
                  title={
                    !canRegisterMenu
                      ? registerDisabledReason
                      : registerTargetRestaurantName
                      ? `「${registerTargetRestaurantName}」のメニュー一覧に追加します`
                      : undefined
                  }
                  className="flex w-full flex-col items-center gap-0.5 rounded-xl bg-emerald-600 py-2.5 font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 sm:py-3"
                >
                  {saving ? (
                    "保存中..."
                  ) : (
                    <span className="text-sm sm:text-base">メニューに登録</span>
                  )}
                </button>
                {!canRegisterMenu && (
                  <p className="px-1 text-center text-[11px] leading-snug text-amber-300">
                    {registerDisabledReason ?? "追加先のお店がないため、メニュー登録はできません。"}
                  </p>
                )}
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

const DIET_PHASES: DietPhase[] = [1, 2, 3];

const PFC_MACRO_TARGET_KEYS = [
  "protein_target_g",
  "fat_target_g",
  "carbs_target_g",
] as const;

type PfcMacroTargetKey = (typeof PFC_MACRO_TARGET_KEYS)[number];

function pfcTargetDraftKey(phase: DietPhase, macro: PfcMacroTargetKey): string {
  return `${phase}:${macro}`;
}

/** ドラフト文字列を確定グラム数に。空・非数は fallback（編集前の確定値）を返す */
function committedPfcGramsFromDraft(raw: string, fallback: number): number {
  const t = raw.trim();
  if (t === "") return fallback;
  const v = parseFloat(t);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(1, Math.round(v));
}

function mergePfcTargetDraftsIntoProfiles(
  base: PhaseProfiles,
  drafts: Record<string, string>
): PhaseProfiles {
  let result = base;
  for (const ph of DIET_PHASES) {
    const pk = String(ph) as keyof PhaseProfiles;
    for (const macro of PFC_MACRO_TARGET_KEYS) {
      const dkey = pfcTargetDraftKey(ph, macro);
      if (!Object.prototype.hasOwnProperty.call(drafts, dkey)) continue;
      const nextVal = committedPfcGramsFromDraft(drafts[dkey]!, result[pk][macro]);
      result = {
        ...result,
        [pk]: { ...result[pk], [macro]: nextVal },
      };
    }
  }
  return result;
}

/** 設定ドロワー内: 目標セット名（タップで表示中に／右クリック・長押しで名前変更） */
function GoalSetSlotButton({
  label,
  selected,
  disabled,
  onSelect,
  onOpenMenu,
  className: classNameProp,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onOpenMenu: (clientX: number, clientY: number) => void;
  /** 省略時は横並びチップ用の flex-1 */
  className?: string;
}) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e.clientX, e.clientY);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t) return;
        touchAnchorRef.current = { x: t.clientX, y: t.clientY };
        clearLongPress();
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          const a = touchAnchorRef.current;
          touchAnchorRef.current = null;
          if (a) onOpenMenu(a.x, a.y);
        }, 550);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        const a = touchAnchorRef.current;
        if (!t || !a) return;
        if (Math.abs(t.clientX - a.x) > 12 || Math.abs(t.clientY - a.y) > 12) {
          clearLongPress();
          touchAnchorRef.current = null;
        }
      }}
      onTouchEnd={() => {
        clearLongPress();
        touchAnchorRef.current = null;
      }}
      onTouchCancel={() => {
        clearLongPress();
        touchAnchorRef.current = null;
      }}
      title="タップで上部バー用のセットに。長押しまたは右クリックで名前を変更"
      className={`py-2 px-1.5 rounded-lg text-xs font-medium transition-colors border touch-manipulation ${
        selected
          ? "bg-emerald-600 border-emerald-500 text-white"
          : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
      } disabled:opacity-50 ${classNameProp ?? "flex-1 min-w-0"}`}
    >
      <span className="block truncate">{label}</span>
    </button>
  );
}

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
  const { exportRestaurants, exportMenuItems } = partitionForFullJsonExport(restaurants, menuItems);
  const [profiles, setProfiles] = useState<PhaseProfiles>(() =>
    structuredClone(settings.phase_profiles)
  );
  /** 選択中＝上部バーに使うセット＝直下で編集するセット（内部では diet_phase 1〜3） */
  const [selectedSlot, setSelectedSlot] = useState<DietPhase>(settings.diet_phase);
  const [saving, setSaving] = useState(false);
  const [slotSaving, setSlotSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllError, setExportAllError] = useState<string | null>(null);
  const [profileSlotMenu, setProfileSlotMenu] = useState<
    null | { phase: DietPhase; x: number; y: number }
  >(null);
  const [renameProfilePhase, setRenameProfilePhase] = useState<DietPhase | null>(null);
  /** PFC 目標の編集中文字列（キーは `pfcTargetDraftKey`）。確定は blur または保存時 */
  const [pfcTargetDrafts, setPfcTargetDrafts] = useState<Record<string, string>>({});

  const openProfileSlotMenu = useCallback((phase: DietPhase, clientX: number, clientY: number) => {
    if (typeof window === "undefined") return;
    const x = Math.min(
      window.innerWidth - TAB_CONTEXT_MENU_W - 8,
      Math.max(8, clientX)
    );
    const y = Math.min(
      window.innerHeight - TAB_CONTEXT_MENU_H - 8,
      Math.max(8, clientY)
    );
    setProfileSlotMenu({ phase, x, y });
  }, []);

  useEffect(() => {
    if (!profileSlotMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileSlotMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileSlotMenu]);

  async function selectSlot(next: DietPhase) {
    if (next === selectedSlot) return;
    setSlotSaving(true);
    setError(null);
    const result = await updateUserSettings({ diet_phase: next });
    setSlotSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSelectedSlot(next);
    onSaved({ ...settings, diet_phase: next, phase_profiles: settings.phase_profiles });
  }

  async function handleSaveProfiles() {
    const mergedProfiles = mergePfcTargetDraftsIntoProfiles(profiles, pfcTargetDrafts);
    for (const ph of DIET_PHASES) {
      const pk = String(ph) as keyof PhaseProfiles;
      const pr = mergedProfiles[pk];
      if (
        !Number.isFinite(pr.protein_target_g) ||
        !Number.isFinite(pr.fat_target_g) ||
        !Number.isFinite(pr.carbs_target_g) ||
        pr.protein_target_g <= 0 ||
        pr.fat_target_g <= 0 ||
        pr.carbs_target_g <= 0
      ) {
        setError("各セットの PFC は正の数値にしてください");
        return;
      }
      if (!pr.name.trim()) {
        setError("各セットの名前を入力してください");
        return;
      }
    }
    const normalized: PhaseProfiles = {
      "1": {
        ...mergedProfiles["1"],
        name: mergedProfiles["1"].name.trim(),
        protein_target_g: Math.round(mergedProfiles["1"].protein_target_g),
        fat_target_g: Math.round(mergedProfiles["1"].fat_target_g),
        carbs_target_g: Math.round(mergedProfiles["1"].carbs_target_g),
      },
      "2": {
        ...mergedProfiles["2"],
        name: mergedProfiles["2"].name.trim(),
        protein_target_g: Math.round(mergedProfiles["2"].protein_target_g),
        fat_target_g: Math.round(mergedProfiles["2"].fat_target_g),
        carbs_target_g: Math.round(mergedProfiles["2"].carbs_target_g),
      },
      "3": {
        ...mergedProfiles["3"],
        name: mergedProfiles["3"].name.trim(),
        protein_target_g: Math.round(mergedProfiles["3"].protein_target_g),
        fat_target_g: Math.round(mergedProfiles["3"].fat_target_g),
        carbs_target_g: Math.round(mergedProfiles["3"].carbs_target_g),
      },
    };
    setPfcTargetDrafts({});
    setProfiles(normalized);
    setSaving(true);
    setError(null);
    const result = await updateUserSettings({ phase_profiles: normalized });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setProfiles(normalized);
    onSaved({ ...settings, diet_phase: selectedSlot, phase_profiles: normalized });
    setSaving(false);
    onClose();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleDownloadFullData() {
    setExportAllError(null);
    setExportingAll(true);
    try {
      const { entries, error: logErr } = await getFoodLogForExport();
      if (logErr) {
        setExportAllError(logErr);
        return;
      }
      const payload = buildFullDataExportPayload(restaurants, menuItems, entries);
      downloadJsonDocument(`ketolog-all-${payload.exportedAt}.json`, payload);
    } finally {
      setExportingAll(false);
    }
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
          {/* PFC 目標セット（3つ） */}
          <div>
            <h3 className="text-sm font-medium text-white mb-1">PFC 目標セット</h3>
            <p className="text-xs text-gray-500 mb-3">
              各行が1セットです。名前をタップするとそのセットが上部バーの目標になります。名前の長押し／右クリックで表示名を変更できます。
            </p>
            <div className="mb-1 grid grid-cols-1 sm:grid-cols-[minmax(6rem,7.5rem)_1fr] gap-x-2 gap-y-1 items-end">
              <span className="hidden sm:block" aria-hidden />
              <div className="hidden sm:grid grid-cols-3 gap-1.5 text-center">
                <span className="text-[10px] font-medium text-blue-400">P</span>
                <span className="text-[10px] font-medium text-yellow-400">F</span>
                <span className="text-[10px] font-medium text-emerald-400">C</span>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {DIET_PHASES.map((ph) => {
                const pk = String(ph) as keyof PhaseProfiles;
                const pr = profiles[pk];
                return (
                  <div
                    key={ph}
                    className={`grid grid-cols-1 sm:grid-cols-[minmax(6rem,7.5rem)_1fr] gap-2 rounded-xl border p-2 ${
                      selectedSlot === ph
                        ? "border-emerald-600/70 bg-emerald-950/25"
                        : "border-gray-700 bg-gray-800/30"
                    }`}
                  >
                    <GoalSetSlotButton
                      label={pr.name}
                      selected={selectedSlot === ph}
                      disabled={slotSaving}
                      onSelect={() => void selectSlot(ph)}
                      onOpenMenu={(cx, cy) => openProfileSlotMenu(ph, cx, cy)}
                      className="w-full min-w-0 sm:min-h-[4.5rem] flex items-center justify-center"
                    />
                    <div className="grid grid-cols-3 gap-1.5 items-end min-w-0">
                      {(
                        [
                          { key: "protein_target_g" as const, short: "P", color: "text-blue-400" },
                          { key: "fat_target_g" as const, short: "F", color: "text-yellow-400" },
                          { key: "carbs_target_g" as const, short: "C", color: "text-emerald-400" },
                        ] as const
                      ).map(({ key, short, color }) => {
                        const dkey = pfcTargetDraftKey(ph, key);
                        return (
                        <div key={key} className="min-w-0">
                          <p className={`sm:hidden text-[10px] mb-0.5 text-center font-medium ${color}`}>
                            {short}
                          </p>
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={
                                Object.prototype.hasOwnProperty.call(pfcTargetDrafts, dkey)
                                  ? pfcTargetDrafts[dkey]
                                  : String(pr[key])
                              }
                              onChange={(e) => {
                                setPfcTargetDrafts((prev) => ({
                                  ...prev,
                                  [dkey]: e.target.value,
                                }));
                              }}
                              onBlur={() => {
                                setPfcTargetDrafts((drafts) => {
                                  if (!Object.prototype.hasOwnProperty.call(drafts, dkey)) {
                                    return drafts;
                                  }
                                  const raw = drafts[dkey]!;
                                  setProfiles((prev) => {
                                    const current = prev[pk][key];
                                    const nextVal = committedPfcGramsFromDraft(raw, current);
                                    return { ...prev, [pk]: { ...prev[pk], [key]: nextVal } };
                                  });
                                  const rest = { ...drafts };
                                  delete rest[dkey];
                                  return rest;
                                });
                              }}
                              className="w-full min-w-0 px-1.5 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm text-center focus:outline-none focus:border-emerald-500"
                              aria-label={`${pr.name}の${short === "P" ? "タンパク質" : short === "F" ? "脂質" : "糖質"}目標グラム`}
                            />
                            <span className="text-[10px] text-gray-500 shrink-0">g</span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            <button
              type="button"
              onClick={() => void handleSaveProfiles()}
              disabled={saving}
              className="mt-3 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {saving ? "保存中..." : "目標を保存する"}
            </button>
          </div>

          {/* 全データエクスポート */}
          <div>
            <h3 className="text-sm font-medium text-white mb-1">データエクスポート</h3>
            <p className="text-xs text-gray-400 mb-3">
              メニュータブ等の「お店」{exportRestaurants.length} 件とメニュー {exportMenuItems.length} 件に加え、
              これまでの食事ログ（全期間）をまとめてエクスポートします。内部用のスナップショット記録のお店と、その店のメニューは含みません。
            </p>
            {exportAllError && <p className="text-red-400 text-xs mb-2">{exportAllError}</p>}
            <button
              type="button"
              onClick={() => void handleDownloadFullData()}
              disabled={exportingAll}
              className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {exportingAll ? "取得中..." : "全データをJSONでダウンロード"}
            </button>
          </div>

          <div>
            <h3 className="text-sm font-medium text-white mb-1">分析</h3>
            <p className="text-xs text-gray-400 mb-3">
              過去7日・30日・カスタム期間（最大90日）の食事ログを、日次集計と一覧で確認できます。
            </p>
            <a
              href="/insights"
              className="block w-full rounded-xl bg-gray-700 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-gray-600"
            >
              分析画面を開く
            </a>
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

      {profileSlotMenu && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] cursor-default bg-transparent"
            aria-label="メニューを閉じる"
            onClick={() => setProfileSlotMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-[56] min-w-[10rem] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
            style={{
              left: profileSlotMenu.x,
              top: profileSlotMenu.y,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-800"
              onClick={() => {
                setRenameProfilePhase(profileSlotMenu.phase);
                setProfileSlotMenu(null);
              }}
            >
              名前を変更
            </button>
          </div>
        </>
      )}

      {renameProfilePhase != null && (
        <RestaurantRenameSheet
          key={renameProfilePhase}
          title="セットの名前を変更"
          initialName={profiles[String(renameProfilePhase) as keyof PhaseProfiles].name}
          maxLength={48}
          isSaving={false}
          inputAriaLabel="セット名"
          onClose={() => setRenameProfilePhase(null)}
          onSave={(trimmed) => {
            if (!trimmed) {
              alert("名前を入力してください");
              return;
            }
            const pk = String(renameProfilePhase) as keyof PhaseProfiles;
            setProfiles((prev) => ({
              ...prev,
              [pk]: { ...prev[pk], name: trimmed.slice(0, 48) },
            }));
            setRenameProfilePhase(null);
          }}
        />
      )}
    </>
  );
}

/** 全データ JSON から内部用スナップショット行と、その店に紐づくメニューを除く */
function partitionForFullJsonExport(restaurants: Restaurant[], menuItems: MenuItem[]) {
  const exportRestaurants = restaurants.filter((r) => !isSnapshotRestaurant(r));
  const ids = new Set(exportRestaurants.map((r) => r.id));
  const exportMenuItems = menuItems.filter((m) => ids.has(m.restaurant_id));
  return { exportRestaurants, exportMenuItems };
}

function buildFullDataExportPayload(
  restaurants: Restaurant[],
  menuItems: MenuItem[],
  foodLog: FoodLogExportEntry[]
) {
  const { exportRestaurants, exportMenuItems } = partitionForFullJsonExport(restaurants, menuItems);
  return {
    version: 2 as const,
    exportedAt: new Date().toISOString().split("T")[0],
    restaurants: exportRestaurants.map((r) => ({
      name: r.name,
      category: r.category,
      menuItems: exportMenuItems
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
    foodLog,
  };
}

function downloadJsonDocument(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RestaurantRenameSheet({
  title,
  initialName,
  maxLength,
  isSaving,
  onClose,
  onSave,
  inputAriaLabel = "新しい店名",
}: {
  title: string;
  initialName: string;
  maxLength: number;
  isSaving: boolean;
  onClose: () => void;
  onSave: (trimmed: string) => void | Promise<void>;
  /** スクリーンリーダー用（お店以外の名前変更でも流用） */
  inputAriaLabel?: string;
}) {
  const [value, setValue] = useState(initialName);
  const titleId = useId();
  const inputId = useId();

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[58]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-[59] max-w-md mx-auto flex flex-col rounded-t-2xl border-x border-t border-gray-700 bg-gray-900 shadow-lg pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" aria-hidden />
        </div>
        <div className="px-4 pt-2 pb-4 space-y-3">
          <h2 id={titleId} className="text-center text-sm font-semibold text-white">
            {title}
          </h2>
          <div>
            <label htmlFor={inputId} className="sr-only">
              {inputAriaLabel}
            </label>
            <input
              id={inputId}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={maxLength}
              className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-emerald-500"
              autoFocus
            />
            <p className="text-[11px] text-gray-500 mt-1 text-right">
              {value.length}/{maxLength}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void onSave(value.trim())}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </>
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
  const activeProfile = useMemo(
    () => activePhaseProfile(currentSettings),
    [currentSettings]
  );
  const [phaseQuickSaving, setPhaseQuickSaving] = useState(false);
  const selectQuickPhase = useCallback(
    async (ph: DietPhase) => {
      if (ph === currentSettings.diet_phase || phaseQuickSaving) return;
      setPhaseQuickSaving(true);
      const r = await updateUserSettings({ diet_phase: ph });
      setPhaseQuickSaving(false);
      if (r.error) {
        alert(r.error);
        return;
      }
      setCurrentSettings((prev) => ({ ...prev, diet_phase: ph }));
    },
    [currentSettings.diet_phase, phaseQuickSaving]
  );
  const [showSettings, setShowSettings]       = useState(false);
  const {
    restaurants,
    menuItems,
    selectedRestaurantId,
    setSelectedRestaurantId,
    compositionTargetRestaurantId,
    setCompositionTargetRestaurantId,
    lastRealRestaurantTabIdRef,
    deletingRestaurant,
    confirmDeleteRestaurant,
    setConfirmDeleteRestaurant,
    showImportMenuItems,
    setShowImportMenuItems,
    restaurantTabMenu,
    setRestaurantTabMenu,
    renameRestaurantTarget,
    setRenameRestaurantTarget,
    renameRestaurantSaving,
    restaurantAddSheet,
    setRestaurantAddSheet,
    tabRestaurants,
    tabRestaurantIds,
    selectedRestaurantIdResolved,
    resolvedCompositionTargetId,
    menuAddRestaurantId,
    selectedRestaurant,
    restaurantNameById,
    favoriteMenuItemIds,
    openRestaurantTabMenu,
    submitRestaurantRename,
    handleRestaurantDragEnd,
    handleToggleFavorite,
    menuGroups,
    collapsibleMenuSectionKeys,
    menuGroupCollapseSessionKey,
    applyMenuItemSaved,
    applyMenuItemDeleted,
    handleDeleteRestaurant,
    registerManualRestaurant,
    registerImportedRestaurant,
    registerAdditionalMenuItems,
  } = useRestaurantState({
    initialRestaurants,
    initialMenuItems,
    initialFavoriteGroups,
  });
  const [cart, setCart]             = useState<Map<string, CartEntry>>(new Map());
  const [mealType, setMealType]     = useState<MealType>(initialMealType);
  const [saving, setSaving]         = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  // sm 未満は折りたたみのまま。デスクトップは初回ペイント前に開く（useEffect+rAF だと描画後に伸びて CLS になる）
  useLayoutEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) {
      // 初回ペイント前にデスクトップ既定（開いたカート）を適用して CLS を防ぐ。モバイルは SSR も折りたたみのまま。
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 上記の同期レイアウト用途のみ
      setCartExpanded(true);
    }
  }, []);
  const [itemDrawer, setItemDrawer] = useState<ItemDrawerState | null>(null);

  // ── 日付ナビゲーション・食事ログ ────────────────────────────────────────────
  const {
    selectedDate,
    consumedForDate,
    setConsumedForDate,
    logEntries,
    setLogEntries,
    loadingDate,
    showLogEntries,
    setShowLogEntries,
    editingEntry,
    setEditingEntry,
    navigateDate,
    goToToday,
    refreshLogForDate,
    handleDeleteEntry,
  } = useMealLog({ today, todayConsumed, initialLogEntries });

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

  // ── カート計算 ──────────────────────────────────────────────────────────────
  const cartPFC = useMemo(() => {
    let acc: PfcGrams = { p: 0, f: 0, c: 0 };
    for (const entry of cart.values()) {
      const g = entry.gramsPerServing * entry.count;
      const part: PfcGrams =
        entry.kind === "menu"
          ? {
              p: ((entry.item.protein_per_100g ?? 0) * g) / 100,
              f: ((entry.item.fat_per_100g ?? 0) * g) / 100,
              c: ((entry.item.carbs_per_100g ?? 0) * g) / 100,
            }
          : pfcFromPer100(entry.protein_per_100g, entry.fat_per_100g, entry.carbs_per_100g, g);
      acc = sumPfc(acc, part);
    }
    return acc;
  }, [cart]);

  const totalPFC = sumPfc(
    {
      p: consumedForDate.protein,
      f: consumedForDate.fat,
      c: consumedForDate.carbs,
    },
    cartPFC
  );

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
        p: activeProfile.protein_target_g,
        f: activeProfile.fat_target_g,
        c: activeProfile.carbs_target_g,
      },
    });
  }, [
    selectedDate,
    today,
    activeProfile.protein_target_g,
    activeProfile.fat_target_g,
    activeProfile.carbs_target_g,
    totalPFC.p,
    totalPFC.f,
    totalPFC.c,
    headerHintTimeTick,
  ]);

  const [headerHint, setHeaderHint] = useState<string | null>(null);
  const [headerHintFullOpen, setHeaderHintFullOpen] = useState(false);
  const headerHintDisplayedRef = useRef<string | null>(null);
  const { banner: appUpdateBanner, applyUpdate: applyAppUpdate } = useAppUpdateBanner();

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
    applyMenuItemSaved(saved);
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
    applyMenuItemDeleted(id);
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
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
    const savedCart = new Map(cart);
    const now = Date.now();
    const tempIds = items.map((_, i) => `opt-${now}-${i}`);
    const optimisticEntries: FoodLogEntry[] = items.map((item, i) => ({
      id: tempIds[i],
      date: selectedDate,
      meal_type: mealType,
      item_name: item.name,
      grams: item.totalGrams,
      protein_g: item.proteinG,
      fat_g: item.fatG,
      carbs_g: item.carbsG,
      source: item.restaurantId ?? null,
      menu_item_id: item.menuItemId ?? null,
    }));

    setCart(new Map());
    setLogEntries(prev => [...prev, ...optimisticEntries]);
    setConsumedForDate(prev => ({
      protein: prev.protein + items.reduce((s, i) => s + i.proteinG, 0),
      fat: prev.fat + items.reduce((s, i) => s + i.fatG, 0),
      carbs: prev.carbs + items.reduce((s, i) => s + i.carbsG, 0),
    }));

    const { error } = await saveMealToLog(items, mealType, selectedDate);
    if (error) {
      alert(`保存に失敗しました: ${error}`);
      setCart(savedCart);
      setLogEntries(prev => prev.filter(e => !tempIds.includes(e.id)));
      setConsumedForDate(prev => ({
        protein: prev.protein - items.reduce((s, i) => s + i.proteinG, 0),
        fat: prev.fat - items.reduce((s, i) => s + i.fatG, 0),
        carbs: prev.carbs - items.reduce((s, i) => s + i.carbsG, 0),
      }));
      setSaving(false);
      return;
    }
    await refreshLogForDate(selectedDate);
    setSaving(false);
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const headerCenterUpdate = appUpdateBanner.kind === "update" ? appUpdateBanner : null;
  const headerCenterMessage = headerCenterUpdate?.line ?? headerHint;
  const headerCenterIsAppUpdate = headerCenterUpdate !== null;
  const hintDialogOpen = Boolean(
    headerHint && headerHintFullOpen && !headerCenterIsAppUpdate
  );

  return (
    <>
      <PfcHeader
        dateNav={
          <div className="flex-none flex items-center justify-between px-1.5 sm:px-4 py-0.5 sm:py-2 border-b border-gray-800 bg-gray-900 gap-0.5 sm:gap-2">
            <button
              type="button"
              onClick={() => navigateDate(-1)}
              disabled={loadingDate}
              className="min-h-8 min-w-8 sm:min-h-8 sm:min-w-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 transition-colors text-base sm:text-lg rounded-md sm:rounded-none active:bg-gray-800/50 shrink-0"
            >
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
            <button
              type="button"
              onClick={() => navigateDate(1)}
              disabled={selectedDate >= today || loadingDate}
              className="min-h-8 min-w-8 sm:min-h-8 sm:min-w-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 transition-colors text-base sm:text-lg rounded-md sm:rounded-none active:bg-gray-800/50 shrink-0"
            >
              ›
            </button>
          </div>
        }
        dietPhases={DIET_PHASES}
        phaseProfiles={currentSettings.phase_profiles}
        activeDietPhase={currentSettings.diet_phase}
        phaseQuickSaving={phaseQuickSaving}
        onSelectQuickPhase={selectQuickPhase}
        totalConsumed={totalPFC}
        proteinTargetG={activeProfile.protein_target_g}
        fatTargetG={activeProfile.fat_target_g}
        carbsTargetG={activeProfile.carbs_target_g}
        centerMessage={headerCenterMessage}
        centerIsAppUpdate={headerCenterIsAppUpdate}
        onCenterClick={() => {
          if (headerCenterIsAppUpdate) applyAppUpdate();
          else setHeaderHintFullOpen(true);
        }}
        centerTitle={
          headerCenterIsAppUpdate ? headerCenterUpdate?.detail : headerHint ?? undefined
        }
        centerAriaLabel={
          headerCenterIsAppUpdate
            ? "アプリを最新版に更新する（タップで再読み込み）"
            : "ヘッダーメッセージの全文を表示"
        }
        centerAriaHasPopup={headerCenterIsAppUpdate ? undefined : "dialog"}
        centerAriaExpanded={headerCenterIsAppUpdate ? undefined : headerHintFullOpen}
        onOpenSettings={() => setShowSettings(true)}
        headerHint={headerHint}
        hintDialogOpen={hintDialogOpen}
        onCloseHintDialog={() => setHeaderHintFullOpen(false)}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {/* 記録済みパネル */}
        {logEntries.length > 0 && (
          <div className="flex-none border-b border-gray-800">
            <button
              type="button"
              aria-expanded={showLogEntries}
              onClick={() => setShowLogEntries((v) => !v)}
              className="w-full flex items-center justify-end gap-2 px-3 sm:px-4 py-1 sm:py-2 text-[11px] sm:text-xs text-gray-400 hover:text-white transition-colors min-h-7 sm:min-h-0 leading-none"
            >
              <Link
                href="/insights"
                className="rounded-md border border-gray-700 px-1.5 py-1 text-[10px] text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                過去7日を見る
              </Link>
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

        <RestaurantPanel
          favoritesTabId={FAVORITES_TAB_ID}
          compositionTabId={MEXT_COMPOSITION_TAB_ID}
          selectedRestaurantIdResolved={selectedRestaurantIdResolved}
          onSelectFavorites={() => {
            setSelectedRestaurantId(FAVORITES_TAB_ID);
            setConfirmDeleteRestaurant(false);
          }}
          onSelectCompositionTab={() => {
            if (
              selectedRestaurantIdResolved !== FAVORITES_TAB_ID &&
              selectedRestaurantIdResolved !== MEXT_COMPOSITION_TAB_ID
            ) {
              setCompositionTargetRestaurantId(selectedRestaurantIdResolved);
            }
            setConfirmDeleteRestaurant(false);
            setSelectedRestaurantId(MEXT_COMPOSITION_TAB_ID);
          }}
          tabRestaurants={tabRestaurants}
          tabRestaurantIds={tabRestaurantIds}
          onSelectRestaurantTab={(id) => {
            setSelectedRestaurantId(id);
            setConfirmDeleteRestaurant(false);
          }}
          onOpenRestaurantTabMenu={openRestaurantTabMenu}
          onRestaurantDragEnd={(e) => void handleRestaurantDragEnd(e)}
          onOpenRestaurantAddSheet={() => setRestaurantAddSheet("choice")}
        />

        <MenuItemList
          selectedRestaurantIdResolved={selectedRestaurantIdResolved}
          snapshotRestaurantId={snapshotRestaurantId}
          tabRestaurants={tabRestaurants}
          resolvedCompositionTargetId={resolvedCompositionTargetId}
          onCompositionTargetChange={setCompositionTargetRestaurantId}
          onPickStandardFood={(row) => {
            const rid = resolvedCompositionTargetId || snapshotRestaurantId;
            if (!rid) return;
            if (resolvedCompositionTargetId) {
              const back = lastRealRestaurantTabIdRef.current;
              const safeBack =
                back &&
                back !== MEXT_COMPOSITION_TAB_ID &&
                back !== FAVORITES_TAB_ID
                  ? back
                  : resolvedCompositionTargetId;
              setSelectedRestaurantId(safeBack);
            }
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
          onOpenItemAddDrawer={(restaurantId) =>
            setItemDrawer({ kind: "add", restaurantId, openedAt: Date.now() })
          }
          menuGroupCollapseSessionKey={menuGroupCollapseSessionKey}
          collapsibleMenuSectionKeys={collapsibleMenuSectionKeys}
          menuGroups={menuGroups}
          cart={cart}
          proteinTargetG={activeProfile.protein_target_g}
          fatTargetG={activeProfile.fat_target_g}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          onChangeGrams={updateGrams}
          onEditItem={(item) => setItemDrawer({ kind: "edit", item })}
          onToggleFavorite={handleToggleFavorite}
          favoriteMenuItemIds={favoriteMenuItemIds}
          selectedRestaurant={selectedRestaurant}
          confirmDeleteRestaurant={confirmDeleteRestaurant}
          deletingRestaurant={deletingRestaurant}
          onSetConfirmDeleteRestaurant={setConfirmDeleteRestaurant}
          onOpenImportMenuItems={() => setShowImportMenuItems(true)}
          onDeleteRestaurant={() => void handleDeleteRestaurant()}
          onDownloadRestaurantJson={() => {
            if (selectedRestaurant) {
              downloadRestaurantJson(selectedRestaurant, menuItems);
            }
          }}
        />

        {/* カート: sm+ は従来どおりインライン展開。未満は折りたたみバー＋展開時オーバーレイ（メニュー領域を確保） */}
        <CartPanel
          mealType={mealType}
          onMealTypeChange={setMealType}
          cartExpanded={cartExpanded}
          onCartExpandedChange={setCartExpanded}
          cartEntries={cartEntries}
          cartPfc={cartPFC}
          saving={saving}
          onSave={handleSave}
          onRemoveCartLine={removeCartLine}
        />
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
          registerTargets={tabRestaurants}
          registerTargetRestaurantId={itemDrawer.kind === "add" ? itemDrawer.restaurantId : ""}
          onRegisterTargetChange={(restaurantId) =>
            setItemDrawer((prev) =>
              prev && prev.kind === "add"
                ? { ...prev, restaurantId }
                : prev
            )
          }
          registerTargetRestaurantName={
            itemDrawer.kind === "add"
              ? (tabRestaurants.some((r) => r.id === itemDrawer.restaurantId)
                ? (restaurantNameById.get(itemDrawer.restaurantId) ?? "")
                : "")
              : selectedRestaurantIdResolved === FAVORITES_TAB_ID
                ? (tabRestaurants[0]?.name ?? "")
                : (selectedRestaurant?.name ?? "")
          }
          canRegisterMenu={
            itemDrawer.kind === "edit" ||
            tabRestaurants.some((r) => r.id === itemDrawer.restaurantId)
          }
          registerDisabledReason={
            itemDrawer.kind === "add" &&
            !tabRestaurants.some((r) => r.id === itemDrawer.restaurantId)
              ? "追加先のお店がないため、メニュー登録はできません。先にお店を作成してください。"
              : undefined
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
          onAdded={registerManualRestaurant}
        />
      )}

      {/* お店追加: JSONインポート */}
      {restaurantAddSheet === "import" && (
        <ImportRestaurantDrawer
          onClose={() => setRestaurantAddSheet(null)}
          onImported={registerImportedRestaurant}
        />
      )}

      {/* お店追加: プリセット */}
      {restaurantAddSheet === "preset" && (
        <PresetSelectDrawer
          presets={presets}
          onClose={() => setRestaurantAddSheet(null)}
          onImported={registerImportedRestaurant}
        />
      )}

      {/* 既存お店へのJSONメニュー追加 */}
      {showImportMenuItems && selectedRestaurant && (
        <ImportMenuItemsDrawer
          restaurant={selectedRestaurant}
          onClose={() => setShowImportMenuItems(false)}
          onImported={registerAdditionalMenuItems}
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

      {/* お店タブ: コンテキストメニュー */}
      {restaurantTabMenu && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] cursor-default bg-transparent"
            aria-label="メニューを閉じる"
            onClick={() => setRestaurantTabMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-[56] min-w-[10rem] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
            style={{
              left: restaurantTabMenu.x,
              top: restaurantTabMenu.y,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-800"
              onClick={() => {
                setRenameRestaurantTarget(restaurantTabMenu.restaurant);
                setRestaurantTabMenu(null);
              }}
            >
              名前を変更
            </button>
          </div>
        </>
      )}

      {renameRestaurantTarget && (
        <RestaurantRenameSheet
          key={renameRestaurantTarget.id}
          title="お店の名前を変更"
          initialName={renameRestaurantTarget.name}
          maxLength={RESTAURANT_NAME_MAX_LENGTH}
          isSaving={renameRestaurantSaving}
          onClose={() => setRenameRestaurantTarget(null)}
          onSave={async (trimmed) => {
            if (!trimmed) {
              alert("店名を入力してください");
              return;
            }
            await submitRestaurantRename(trimmed);
          }}
        />
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
