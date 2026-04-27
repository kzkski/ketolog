"use client";

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import type { MenuItem, Restaurant, SharedProduct } from "@/types/database";
import type { MealType } from "@ketolog/types";
import { pfcGramsFromNullablePer100 } from "@/lib/menu-item-pfc";
import {
  addMenuItem,
  addMenuItemWithManualSharedProduct,
  deleteMenuItem,
  lookupSharedProductByBarcode,
  updateMenuItem,
  updateMenuItemWithManualSharedProduct,
  type MenuItemUpdate,
} from "../actions/menu-item";
import { saveMealToLog, type SaveItem } from "../actions/food-log";
import type { ImportRestaurantItem } from "../actions/import-export";
import {
  MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES,
  SHARED_PRODUCT_SOURCE_MANUAL_ENTRY,
} from "@/lib/shared-product-source";
import { buildMenuQrPayloadJson, parseMenuSharePayload } from "@/lib/menu-qr-payload";
import { BarcodeScanner } from "./BarcodeScanner";

const RANK_OPTIONS = [
  { value: 1, label: "◎ 最優先" },
  { value: 2, label: "○ 通常" },
  { value: 3, label: "△ 控えめ" },
  { value: 4, label: "✕ 避ける" },
];

type NutrientMode = "per100g" | "perServing";

export type StandardFoodDraft = {
  food_code: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
};

// ドロワーの種別
export type ItemDrawerState =
  | { kind: "edit"; item: MenuItem }
  | {
      kind: "add";
      restaurantId: string;
      /** ドロワー再マウント用（同一お店への連続追加でもフォームをリセットする） */
      openedAt: number;
      logMealType?: MealType;
      standardFoodDraft?: StandardFoodDraft;
    };

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

export type MenuItemDrawerProps = {
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
};

export function MenuItemDrawer({
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
}: MenuItemDrawerProps) {
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
  const hasLockedSharedBarcode = isEdit && Boolean(existing?.shared_barcode);
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
        if (isEdit) {
          setCameraOn(false);
          setScanLoading(false);
          setScanError("メニュー編集ではQR読み取りは利用できません。バーコードのみ読み取れます。");
          return;
        }
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
    [isEdit, canRegisterMenu, registerDisabledReason, applyImportRestaurantItemToForm, lookupOffProductBarcode]
  );

  const closeBarcodeCamera = useCallback(() => {
    setCameraOn(false);
  }, []);

  const reportBarcodeRuntimeError = useCallback((message: string) => {
    setScanError(message);
  }, []);

  const toggleBarcodeScan = useCallback(() => {
    if (hasLockedSharedBarcode) {
      setScanError("このメニューはバーコード登録済みのため、編集画面では再登録できません。");
      return;
    }
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
  }, [cameraOn, cameraSupported, hasLockedSharedBarcode]);

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
    const v = pfcGramsFromNullablePer100(
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
      const result =
        manualSharedProductPending && sharedBarcode
          ? await updateMenuItemWithManualSharedProduct(existing.id, sharedBarcode, data)
          : await updateMenuItem(existing.id, data);
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

          <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-3">
            <p className="text-xs text-gray-400">バーコード</p>
            {sharedBarcode ? (
              <p className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 font-mono text-sm text-gray-100">
                {sharedBarcode}
              </p>
            ) : (
              <p className="text-xs text-gray-500">未登録</p>
            )}
            <BarcodeScanner
              cameraSupported={cameraSupported}
              cameraOn={cameraOn}
              onToggleScan={toggleBarcodeScan}
              scanDisabled={hasLockedSharedBarcode}
              scanDisabledReason={
                hasLockedSharedBarcode
                  ? "このメニューはバーコード登録済みのため、再登録はできません。"
                  : undefined
              }
              acceptQr={!isEdit}
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
              onOpenStandardFoodSearch={!isEdit ? onOpenStandardFoodSearch : undefined}
            />
          </div>

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
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/95 p-1 shadow-lg">
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
