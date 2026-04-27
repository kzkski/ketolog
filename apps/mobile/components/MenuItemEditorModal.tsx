import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manualSharedProductServingFromDefaultGrams } from "@ketolog/domain/manual-shared-product-serving";
import { pfcGramsFromNullablePer100 } from "@ketolog/domain/pfc";
import type { MealType } from "@ketolog/types";
import {
  MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES,
  SHARED_PRODUCT_SOURCE_MANUAL_ENTRY,
} from "@ketolog/domain/shared-product-source";
import {
  buildMenuQrPayloadJson,
  parseMenuSharePayload,
  type MenuShareImportItem,
} from "@ketolog/domain/menu-share-qr";
import QRCode from "react-native-qrcode-svg";

import { MenuBarcodeSection } from "./MenuBarcodeSection";
import { fetchDistinctMenuGroupNames } from "../lib/fetch-distinct-menu-group-names";
import { fetchRestaurantsExcludingSnapshot } from "../lib/fetch-restaurants-excluding-snapshot";
import {
  buildFoodLogInsertPayload,
  enqueueFoodLogDraft,
  newClientRowId,
  type FoodLogOutboxDraft,
} from "../lib/food-log-outbox";
import { getIsOnline, isTransientNetworkError } from "../lib/network";
import { resolveMenuItemGroupOrder } from "../lib/resolve-menu-item-group-order";
import {
  lookupSharedProductByBarcodeMobile,
  type SharedProductRow,
} from "../lib/shared-product-lookup";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

const RANK_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "◎ 最優先" },
  { value: 2, label: "○ 通常" },
  { value: 3, label: "△ 控えめ" },
  { value: 4, label: "✕ 避ける" },
];

const MEMO_MIN_ROWS = 3;

type NutrientMode = "per100g" | "perServing";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
  danger: "#ef4444",
};

function mapMenuItemSaveError(message: string | null | undefined): string | null {
  if (!message) return null;
  if (
    message.includes("menu_item_barcode_exists") ||
    message.includes("menu_items_user_id_restaurant_id_shared_barcode_key")
  ) {
    return "このお店に同じバーコードのメニューがあります";
  }
  return message;
}

function to100g(val: string, gramsStr: string): string {
  const v = parseFloat(val);
  const g = parseFloat(gramsStr);
  if (Number.isNaN(v) || Number.isNaN(g) || g === 0) return val;
  return String(parseFloat(((v * 100) / g).toFixed(2)));
}

function toServing(val: string, gramsStr: string): string {
  const v = parseFloat(val);
  const g = parseFloat(gramsStr);
  if (Number.isNaN(v) || Number.isNaN(g)) return val;
  return String(parseFloat(((v * g) / 100).toFixed(2)));
}

export type StandardFoodDraft = {
  food_code: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
};

export type MenuItemEditorState =
  | { kind: "add"; registerRestaurantIdHint?: string | null; standardFoodDraft?: StandardFoodDraft }
  | { kind: "edit"; menuItemId: string };

type MenuRow = {
  id: string;
  restaurant_id: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number;
  rank: number;
  notes: string | null;
  group_name: string | null;
  shared_barcode: string | null;
  standard_food_code: string | null;
};

type Props = {
  visible: boolean;
  state: MenuItemEditorState | null;
  supabase: SupabaseClient;
  userId: string;
  date: string;
  mealTypeForLog: MealType;
  snapshotRestaurantId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
  onOutboxChanged?: () => void | Promise<void>;
  /** Web の「文科省成分表で検索」: モーダルを閉じて成分表タブへ誘導 */
  onRequestOpenStandardFoodComposition?: () => void;
};

export function MenuItemEditorModal({
  visible,
  state,
  supabase,
  userId,
  date,
  mealTypeForLog,
  snapshotRestaurantId,
  onClose,
  onSaved,
  onToast,
  onOutboxChanged,
  onRequestOpenStandardFoodComposition,
}: Props) {
  const isEdit = state?.kind === "edit";

  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [grams, setGrams] = useState("100");
  const [rank, setRank] = useState(2);
  const [groupName, setGroupName] = useState("");
  const [notes, setNotes] = useState("");
  const [nutrientMode, setNutrientMode] = useState<NutrientMode>("perServing");
  const [rawP, setRawP] = useState<string | null>(null);
  const [rawF, setRawF] = useState<string | null>(null);
  const [rawC, setRawC] = useState<string | null>(null);

  const [logMeal, setLogMeal] = useState<MealType>("lunch");

  const [registerRestaurants, setRegisterRestaurants] = useState<{ id: string; name: string }[]>(
    []
  );
  const [registerRestaurantId, setRegisterRestaurantId] = useState<string | null>(null);
  const [registerRestaurantsLoading, setRegisterRestaurantsLoading] = useState(false);
  const [existingGroupNames, setExistingGroupNames] = useState<string[]>([]);
  const [groupSuggestOpen, setGroupSuggestOpen] = useState(false);

  const [loadedEdit, setLoadedEdit] = useState<MenuRow | null>(null);
  const hasLockedSharedBarcode = isEdit && Boolean(loadedEdit?.shared_barcode);
  const [editLoading, setEditLoading] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [sharedBarcode, setSharedBarcode] = useState<string | null>(null);
  const [standardFoodCode, setStandardFoodCode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraResult, setCameraResult] = useState<SharedProductRow | null>(null);
  const [manualSharedProductPending, setManualSharedProductPending] = useState(false);
  const [lastLookup, setLastLookup] = useState<{ barcode: string; at: number } | null>(null);
  const [servingHint, setServingHint] = useState<string | null>(null);
  const [menuQrImportDone, setMenuQrImportDone] = useState<string | null>(null);
  const [shareQrGenError, setShareQrGenError] = useState<string | null>(null);

  const gramsNum = parseFloat(grams);

  const displayP = nutrientMode === "per100g" ? protein : toServing(protein, grams);
  const displayF = nutrientMode === "per100g" ? fat : toServing(fat, grams);
  const displayC = nutrientMode === "per100g" ? carbs : toServing(carbs, grams);

  const handleNutrientModeChange = useCallback((m: NutrientMode) => {
    setRawP(null);
    setRawF(null);
    setRawC(null);
    setNutrientMode(m);
  }, []);

  const commitNutrientFromText = useCallback(
    (field: "p" | "f" | "c", rawText: string) => {
      const trimmed = rawText.trim();
      const stored = nutrientMode === "per100g" ? trimmed : to100g(trimmed, grams);
      if (field === "p") {
        setProtein(stored);
        setRawP(null);
      }
      if (field === "f") {
        setFat(stored);
        setRawF(null);
      }
      if (field === "c") {
        setCarbs(stored);
        setRawC(null);
      }
    },
    [nutrientMode, grams]
  );

  const resetAddForm = useCallback(() => {
    setName("");
    setProtein("");
    setFat("");
    setCarbs("");
    setGrams("100");
    setRank(2);
    setGroupName("");
    setNotes("");
    setNutrientMode("perServing");
    setRawP(null);
    setRawF(null);
    setRawC(null);
    setLogMeal(mealTypeForLog);
    setLoadedEdit(null);
    setFormError(null);
    setConfirmDelete(false);
    setSharedBarcode(null);
    setStandardFoodCode(null);
    setScanError(null);
    setScanLoading(false);
    setCameraOn(false);
    setCameraResult(null);
    setManualSharedProductPending(false);
    setLastLookup(null);
    setServingHint(null);
    setMenuQrImportDone(null);
  }, [mealTypeForLog]);

  const applyStandardFoodDraft = useCallback((draft: StandardFoodDraft) => {
    setName(draft.name);
    setProtein(draft.protein_per_100g != null ? String(draft.protein_per_100g) : "");
    setFat(draft.fat_per_100g != null ? String(draft.fat_per_100g) : "");
    setCarbs(draft.carbs_per_100g != null ? String(draft.carbs_per_100g) : "");
    setGrams("100");
    setRank(2);
    setGroupName("");
    setNotes("文科省標準成分表（利用可能炭水化物・質量計）");
    setNutrientMode("perServing");
    setRawP(null);
    setRawF(null);
    setRawC(null);
    setLogMeal(mealTypeForLog);
    setLoadedEdit(null);
    setFormError(null);
    setConfirmDelete(false);
    setSharedBarcode(null);
    setStandardFoodCode(draft.food_code);
    setScanError(null);
    setScanLoading(false);
    setCameraOn(false);
    setCameraResult(null);
    setManualSharedProductPending(false);
    setLastLookup(null);
    setServingHint(null);
    setMenuQrImportDone(null);
  }, [mealTypeForLog]);

  useEffect(() => {
    if (!visible || !state) return;
    setFormError(null);
    setConfirmDelete(false);
    if (state.kind === "add") {
      if (state.standardFoodDraft) {
        applyStandardFoodDraft(state.standardFoodDraft);
      } else {
        resetAddForm();
      }
    }
  }, [visible, state, resetAddForm, applyStandardFoodDraft]);

  useEffect(() => {
    if (!visible || !state || state.kind !== "add") return;
    let cancelled = false;
    (async () => {
      setRegisterRestaurantsLoading(true);
      const r = await fetchRestaurantsExcludingSnapshot(supabase, userId);
      if (cancelled) return;
      setRegisterRestaurantsLoading(false);
      if (r.error) {
        setRegisterRestaurants([]);
        setRegisterRestaurantId(null);
        return;
      }
      setRegisterRestaurants(r.restaurants);
      const hint = state.registerRestaurantIdHint;
      setRegisterRestaurantId((prev) => {
        if (hint && r.restaurants.some((x) => x.id === hint)) return hint;
        if (prev && r.restaurants.some((x) => x.id === prev)) return prev;
        return r.restaurants[0]?.id ?? null;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, state, supabase, userId]);

  useEffect(() => {
    if (!visible || !state || state.kind !== "add" || !registerRestaurantId) {
      if (!visible || !state || state.kind !== "add") setExistingGroupNames([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetchDistinctMenuGroupNames(supabase, userId, registerRestaurantId);
      if (!cancelled && !r.error) setExistingGroupNames(r.names);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, state, registerRestaurantId, supabase, userId]);

  useEffect(() => {
    if (!visible || !state || state.kind !== "edit") {
      setLoadedEdit(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setEditLoading(true);
      const { data, error } = await supabase
        .from("menu_items")
        .select(
          "id, restaurant_id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, rank, notes, group_name, shared_barcode, standard_food_code"
        )
        .eq("id", state.menuItemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setEditLoading(false);
      if (error || !data) {
        setFormError(error?.message ?? "メニューを読み込めませんでした");
        setLoadedEdit(null);
        return;
      }
      const row = data as MenuRow;
      setLoadedEdit(row);
      setName(row.name);
      setProtein(row.protein_per_100g != null ? String(row.protein_per_100g) : "");
      setFat(row.fat_per_100g != null ? String(row.fat_per_100g) : "");
      setCarbs(row.carbs_per_100g != null ? String(row.carbs_per_100g) : "");
      setGrams(String(row.default_grams ?? 100));
      setRank(row.rank ?? 2);
      setGroupName(row.group_name ?? "");
      setNotes(row.notes ?? "");
      setNutrientMode("perServing");
      setRawP(null);
      setRawF(null);
      setRawC(null);
      setLogMeal(mealTypeForLog);
      setSharedBarcode(row.shared_barcode ?? null);
      setStandardFoodCode(row.standard_food_code ?? null);
      setScanError(null);
      setScanLoading(false);
      setCameraOn(false);
      setCameraResult(null);
      setManualSharedProductPending(false);
      setLastLookup(null);
      setServingHint(null);
      setMenuQrImportDone(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, state, supabase, userId, mealTypeForLog]);

  const buildMenuPayload = useCallback(() => {
    const gramsNum = parseFloat(grams) || 100;
    const n = (s: string) => {
      if (s.trim() === "") return null;
      const v = parseFloat(s);
      return Number.isFinite(v) ? v : null;
    };
    return {
      name: name.trim(),
      protein_per_100g: n(protein),
      fat_per_100g: n(fat),
      carbs_per_100g: n(carbs),
      default_grams: gramsNum,
      rank,
      notes: notes.trim() || null,
      group_name: groupName.trim() || null,
      shared_barcode: sharedBarcode,
      standard_food_code: standardFoodCode,
    };
  }, [
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

  /** メニュー共有 QR（Web の ItemDrawer と同じペイロード） */
  const shareQrImportItem = useMemo((): MenuShareImportItem | null => {
    if (!isEdit) return null;
    if (!name.trim()) return null;
    const gramsNum = parseFloat(grams) || 100;
    const n = (s: string) => {
      if (s.trim() === "") return null;
      const v = parseFloat(s);
      return Number.isFinite(v) ? v : null;
    };
    return {
      name: name.trim(),
      protein_per_100g: n(protein),
      fat_per_100g: n(fat),
      carbs_per_100g: n(carbs),
      shared_barcode: loadedEdit?.shared_barcode ?? null,
      standard_food_code: loadedEdit?.standard_food_code ?? null,
      default_grams: gramsNum,
      rank,
      notes: notes.trim() || null,
      group: groupName.trim() || null,
    };
  }, [isEdit, name, protein, fat, carbs, grams, rank, notes, groupName, loadedEdit]);

  const shareQrPayload = useMemo(() => {
    if (!shareQrImportItem) return null;
    return buildMenuQrPayloadJson(shareQrImportItem);
  }, [shareQrImportItem]);

  useEffect(() => {
    setShareQrGenError(null);
  }, [shareQrPayload]);

  const registerTargetRestaurantName = useMemo(
    () => registerRestaurants.find((r) => r.id === registerRestaurantId)?.name ?? "",
    [registerRestaurants, registerRestaurantId]
  );

  const canRegisterMenu =
    !isEdit &&
    !registerRestaurantsLoading &&
    registerRestaurants.length > 0 &&
    registerRestaurantId != null;

  const applyImportRestaurantItemToForm = useCallback((item: MenuShareImportItem) => {
    setName(item.name);
    setProtein(
      item.protein_per_100g === null || item.protein_per_100g === undefined
        ? ""
        : String(item.protein_per_100g)
    );
    setFat(item.fat_per_100g === null || item.fat_per_100g === undefined ? "" : String(item.fat_per_100g));
    setCarbs(
      item.carbs_per_100g === null || item.carbs_per_100g === undefined ? "" : String(item.carbs_per_100g)
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
    setFormError(null);
    setNutrientMode("perServing");
    setRawP(null);
    setRawF(null);
    setRawC(null);
    setLastLookup(null);
  }, []);

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
      const res = await lookupSharedProductByBarcodeMobile(supabase, normalized);
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
      setNotes((prev) => {
        if (prev.trim()) return prev;
        if (res.product?.source === SHARED_PRODUCT_SOURCE_MANUAL_ENTRY) {
          return MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES;
        }
        return res.product?.brand ? `OFF: ${res.product.brand}` : "OFF連携";
      });
    },
    [lastLookup, supabase]
  );

  const handleDecodedScan = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setScanError("バーコードを読み取れませんでした。もう一度お試しください。");
        return;
      }
      if (/^https?:\/\//i.test(trimmed)) {
        setScanLoading(false);
        setScanError("URLからの取り込みは、まだ対応していません。");
        return;
      }
      if (trimmed.startsWith("{")) {
        if (isEdit) {
          setScanLoading(false);
          setScanError("メニュー編集ではQR読み取りは利用できません。バーコードのみ読み取れます。");
          return;
        }
        const parsed = parseMenuSharePayload(trimmed);
        if (!parsed.ok) {
          setScanLoading(false);
          setScanError(parsed.error);
          return;
        }
        if (!canRegisterMenu) {
          setScanLoading(false);
          setScanError(
            registerRestaurants.length === 0
              ? "追加先のお店がありません。"
              : "メニュー登録先のお店を選んでください。"
          );
          return;
        }
        setMenuQrImportDone(null);
        applyImportRestaurantItemToForm(parsed.item);
        setMenuQrImportDone(`「${parsed.item.name}」をフォームに反映しました。`);
        return;
      }
      await lookupOffProductBarcode(trimmed);
    },
    [
      applyImportRestaurantItemToForm,
      canRegisterMenu,
      isEdit,
      lookupOffProductBarcode,
      registerRestaurants.length,
    ]
  );

  const applyMenuUpdate = useCallback(
    async (id: string, payload: ReturnType<typeof buildMenuPayload>) => {
      const { data: current, error: fetchErr } = await supabase
        .from("menu_items")
        .select("restaurant_id, group_name")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchErr || !current) {
        return { error: fetchErr?.message ?? "メニューが見つかりません" as string };
      }

      const prevGroupName =
        current.group_name == null ? null : String(current.group_name).trim() || null;
      const nextGroupName = payload.group_name?.trim() || null;
      const updateBody: Record<string, unknown> = {
        name: payload.name,
        protein_per_100g: payload.protein_per_100g,
        fat_per_100g: payload.fat_per_100g,
        carbs_per_100g: payload.carbs_per_100g,
        default_grams: payload.default_grams,
        rank: payload.rank,
        notes: payload.notes,
        group_name: nextGroupName,
        shared_barcode: payload.shared_barcode,
        standard_food_code: payload.standard_food_code,
      };

      if (prevGroupName !== nextGroupName) {
        updateBody.group_order = await resolveMenuItemGroupOrder(
          supabase,
          userId,
          current.restaurant_id as string,
          nextGroupName
        );
      }

      const { error } = await supabase.from("menu_items").update(updateBody).eq("id", id).eq(
        "user_id",
        userId
      );
      return { error: mapMenuItemSaveError(error?.message) ?? null };
    },
    [supabase, userId]
  );

  const handleSaveMenu = useCallback(async () => {
    if (!name.trim()) {
      setFormError("名前を入力してください");
      return;
    }
    if (!state) return;
    const data = buildMenuPayload();

    setBusy(true);
    setFormError(null);
    const online = await getIsOnline();
    if (!online) {
      setBusy(false);
      setFormError("オフラインのときはメニューを保存できません。");
      return;
    }

    if (state.kind === "edit") {
      if (manualSharedProductPending && sharedBarcode) {
        const trimmedName = data.name.trim();
        if (!trimmedName) {
          setBusy(false);
          setFormError("名前を入力してください");
          return;
        }
        if (data.standard_food_code) {
          setBusy(false);
          setFormError("標準成分表とバーコードの同時指定はできません");
          return;
        }
        const rankVal = data.rank;
        if (!Number.isFinite(rankVal) || rankVal < 1 || rankVal > 4) {
          setBusy(false);
          setFormError("ランクの値が不正です");
          return;
        }
        const { data: current, error: fetchErr } = await supabase
          .from("menu_items")
          .select("restaurant_id, group_name, group_order")
          .eq("id", state.menuItemId)
          .eq("user_id", userId)
          .maybeSingle();
        if (fetchErr || !current) {
          setBusy(false);
          const err = fetchErr?.message ?? "メニューが見つかりません";
          setFormError(err);
          onToast(`保存に失敗しました: ${err}`);
          return;
        }
        const prevGroupName =
          current.group_name == null ? null : String(current.group_name).trim() || null;
        const nextGroupName = data.group_name?.trim() || null;
        const groupOrder =
          prevGroupName === nextGroupName
            ? (typeof current.group_order === "number" ? current.group_order : 0)
            : await resolveMenuItemGroupOrder(
                supabase,
                userId,
                current.restaurant_id as string,
                nextGroupName
              );
        const notesRpc = data.notes?.trim() || MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES;
        const serving = manualSharedProductServingFromDefaultGrams(data.default_grams);
        const { error: rpcError } = await supabase.rpc(
          "update_menu_item_with_manual_shared_product",
          {
            p_menu_item_id: state.menuItemId,
            p_barcode: sharedBarcode,
            p_shared_product_name: trimmedName,
            p_shared_brand: null,
            p_shared_protein: data.protein_per_100g,
            p_shared_fat: data.fat_per_100g,
            p_shared_carbs: data.carbs_per_100g,
            p_shared_serving_size: serving.serving_size,
            p_shared_serving_size_grams: serving.serving_size_grams,
            p_menu_name: trimmedName,
            p_menu_protein: data.protein_per_100g,
            p_menu_fat: data.fat_per_100g,
            p_menu_carbs: data.carbs_per_100g,
            p_default_grams: data.default_grams,
            p_rank: rankVal,
            p_notes: notesRpc,
            p_group_name: nextGroupName,
            p_group_order: groupOrder,
          }
        );
        setBusy(false);
        if (rpcError) {
          const msg = rpcError.message ?? "";
          if (msg.includes("menu_item_barcode_exists")) {
            setFormError("このお店に同じバーコードのメニューがあります");
            onToast("このお店に同じバーコードのメニューがあります");
            return;
          }
          if (msg.includes("menu not found")) {
            setFormError("メニューが見つかりません");
            return;
          }
          setFormError(msg);
          onToast(`保存に失敗しました: ${msg}`);
          return;
        }
        onToast("保存しました");
        onClose();
        await onSaved();
        return;
      }

      const { error } = await applyMenuUpdate(state.menuItemId, data);
      setBusy(false);
      if (error) {
        setFormError(error);
        onToast(`保存に失敗しました: ${error}`);
        return;
      }
      onToast("保存しました");
      onClose();
      await onSaved();
      return;
    }

    if (!registerRestaurantId) {
      setBusy(false);
      setFormError(
        registerRestaurants.length === 0
          ? "メニューに載せるお店がありません。店舗を追加してください。"
          : "メニュー登録先のお店を選んでください。"
      );
      return;
    }

    const groupNameTrim = data.group_name?.trim() || null;
    const groupOrder = await resolveMenuItemGroupOrder(
      supabase,
      userId,
      registerRestaurantId,
      groupNameTrim
    );

    if (manualSharedProductPending && sharedBarcode) {
      const trimmedName = data.name.trim();
      if (!trimmedName) {
        setBusy(false);
        setFormError("名前を入力してください");
        return;
      }
      if (data.standard_food_code) {
        setBusy(false);
        setFormError("標準成分表とバーコードの同時指定はできません");
        return;
      }
      const rankVal = data.rank;
      if (!Number.isFinite(rankVal) || rankVal < 1 || rankVal > 4) {
        setBusy(false);
        setFormError("ランクの値が不正です");
        return;
      }
      const notesRpc = data.notes?.trim() || MANUAL_SHARED_PRODUCT_DEFAULT_MENU_NOTES;
      const addServing = manualSharedProductServingFromDefaultGrams(data.default_grams);
      const { data: menuId, error: rpcError } = await supabase.rpc(
        "add_menu_item_with_manual_shared_product",
        {
          p_restaurant_id: registerRestaurantId,
          p_barcode: sharedBarcode,
          p_shared_product_name: trimmedName,
          p_shared_brand: null,
          p_shared_protein: data.protein_per_100g,
          p_shared_fat: data.fat_per_100g,
          p_shared_carbs: data.carbs_per_100g,
          p_shared_serving_size: addServing.serving_size,
          p_shared_serving_size_grams: addServing.serving_size_grams,
          p_menu_name: trimmedName,
          p_menu_protein: data.protein_per_100g,
          p_menu_fat: data.fat_per_100g,
          p_menu_carbs: data.carbs_per_100g,
          p_default_grams: data.default_grams,
          p_rank: rankVal,
          p_notes: notesRpc,
          p_group_name: groupNameTrim,
          p_group_order: groupOrder,
        }
      );
      setBusy(false);
      if (rpcError) {
        const msg = rpcError.message ?? "";
        if (msg.includes("menu_item_barcode_exists")) {
          setFormError("このお店に同じバーコードのメニューがあります");
          onToast("このお店に同じバーコードのメニューがあります");
          return;
        }
        if (msg.includes("restaurant not found")) {
          setFormError("お店が見つかりません");
          return;
        }
        setFormError(msg);
        onToast(`メニュー登録に失敗しました: ${msg}`);
        return;
      }
      if (!menuId) {
        setFormError("メニューの追加に失敗しました");
        return;
      }
      onToast("メニューに登録しました");
      onClose();
      await onSaved();
      return;
    }

    const { error } = await supabase.from("menu_items").insert({
      user_id: userId,
      restaurant_id: registerRestaurantId,
      name: data.name,
      protein_per_100g: data.protein_per_100g,
      fat_per_100g: data.fat_per_100g,
      carbs_per_100g: data.carbs_per_100g,
      default_grams: data.default_grams,
      rank: data.rank,
      notes: data.notes,
      group_name: groupNameTrim,
      group_order: groupOrder,
      shared_barcode: data.shared_barcode,
      standard_food_code: data.standard_food_code,
    });

    setBusy(false);
    if (error) {
      const mapped = mapMenuItemSaveError(error.message) ?? error.message;
      setFormError(mapped);
      onToast(`メニュー登録に失敗しました: ${mapped}`);
      return;
    }
    onToast("メニューに登録しました");
    onClose();
    await onSaved();
  }, [
    name,
    buildMenuPayload,
    state,
    applyMenuUpdate,
    onClose,
    onSaved,
    onToast,
    registerRestaurantId,
    registerRestaurants.length,
    supabase,
    userId,
    manualSharedProductPending,
    sharedBarcode,
  ]);

  const buildSnapshotLogDraft = useCallback((): FoodLogOutboxDraft | null => {
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
      id: newClientRowId(),
      date,
      meal_type: logMeal,
      item_name: name.trim(),
      grams: gramsNum,
      protein_g: v.p,
      fat_g: v.f,
      carbs_g: v.c,
      source: snapshotRestaurantId,
      menu_item_id: null,
      saved_at: new Date().toISOString(),
    };
  }, [snapshotRestaurantId, name, grams, protein, fat, carbs, date, logMeal]);

  const handleLogOnly = useCallback(async () => {
    const draft = buildSnapshotLogDraft();
    if (!draft) {
      setFormError("記録用の店舗情報を読み込めていません。");
      return;
    }
    setBusy(true);
    setFormError(null);
    const online = await getIsOnline();
    if (!online) {
      await enqueueFoodLogDraft(userId, draft);
      setBusy(false);
      onToast("オフラインのため端末に保存しました。通信が戻ったら一覧から再送してください。");
      onClose();
      await onOutboxChanged?.();
      return;
    }
    const { error } = await supabase
      .from("food_log")
      .insert(buildFoodLogInsertPayload(userId, draft));
    setBusy(false);
    if (error) {
      if (error.code === "23505") {
        onToast("保存しました");
        onClose();
        await onSaved();
        return;
      }
      if (isTransientNetworkError(error)) {
        await enqueueFoodLogDraft(userId, draft);
        onToast("通信に失敗しました。端末に下書きを残しました。");
        onClose();
        await onOutboxChanged?.();
        return;
      }
      setFormError(error.message);
      onToast(`保存に失敗しました: ${error.message}`);
      return;
    }
    onToast("保存しました");
    onClose();
    await onSaved();
  }, [
    buildSnapshotLogDraft,
    supabase,
    userId,
    onClose,
    onSaved,
    onToast,
    onOutboxChanged,
  ]);

  const handleDelete = useCallback(async () => {
    if (!state || state.kind !== "edit") return;
    setDeleting(true);
    setFormError(null);
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", state.menuItemId)
      .eq("user_id", userId);
    setDeleting(false);
    if (error) {
      setFormError(error.message);
      onToast(`削除に失敗しました: ${error.message}`);
      return;
    }
    onToast("削除しました");
    onClose();
    await onSaved();
  }, [state, supabase, userId, onClose, onSaved, onToast]);

  const titleText = useMemo(() => {
    if (!state) return "";
    if (state.kind === "edit") return "メニュー編集";
    return registerTargetRestaurantName
      ? `${registerTargetRestaurantName}へメニューを追加`
      : "メニューを追加";
  }, [state, registerTargetRestaurantName]);

  if (!state) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {titleText}
            </Text>
            <Pressable onPress={onClose} disabled={busy} hitSlop={8}>
              <Text style={styles.headerCancel}>キャンセル</Text>
            </Pressable>
          </View>

          {isEdit && editLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollPad}
            >
              <View style={styles.field}>
                <Text style={styles.label}>名前</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="名前"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  editable={!busy}
                />
              </View>

              <View style={styles.barcodeSection}>
                <Text style={styles.label}>バーコード</Text>
                {sharedBarcode ? (
                  <Text style={styles.barcodeValue}>{sharedBarcode}</Text>
                ) : (
                  <Text style={styles.hint}>未登録</Text>
                )}
                <MenuBarcodeSection
                  cameraOn={cameraOn}
                  onToggleCamera={() => {
                    if (hasLockedSharedBarcode) {
                      setScanError("このメニューはバーコード登録済みのため、編集画面では再登録できません。");
                      return;
                    }
                    setScanError(null);
                    setCameraResult(null);
                    setServingHint(null);
                    setMenuQrImportDone(null);
                    setCameraOn((v) => !v);
                  }}
                  scanDisabled={hasLockedSharedBarcode}
                  scanDisabledReason={
                    hasLockedSharedBarcode
                      ? "このメニューはバーコード登録済みのため、再登録はできません。"
                      : undefined
                  }
                  acceptQr={!isEdit}
                  scanLoading={scanLoading}
                  scanError={scanError}
                  cameraResult={
                    cameraResult
                      ? { barcode: cameraResult.barcode, product_name: cameraResult.product_name }
                      : null
                  }
                  menuQrImportDone={menuQrImportDone}
                  manualSharedProductPending={manualSharedProductPending}
                  sharedBarcode={sharedBarcode}
                  servingHint={servingHint}
                  onBarcodeData={(raw) => void handleDecodedScan(raw)}
                  onRuntimeError={(message) => setScanError(message)}
                  onCameraClosed={() => setCameraOn(false)}
                  onOpenStandardFoodSearch={
                    !isEdit && onRequestOpenStandardFoodComposition
                      ? () => {
                          if (registerRestaurants.length === 0) {
                            setFormError("先にお店を追加してください。");
                            onToast("先にお店を追加してください。");
                            return;
                          }
                          onRequestOpenStandardFoodComposition();
                        }
                      : undefined
                  }
                />
              </View>

              <View style={styles.field}>
                <View style={styles.gramsModeRow}>
                  <Text style={styles.gramsInlineLabel} numberOfLines={1}>
                    1回の量（g）
                  </Text>
                  <TextInput
                    value={grams}
                    onChangeText={setGrams}
                    keyboardType="decimal-pad"
                    style={[styles.input, styles.gramsInputRow]}
                    editable={!busy}
                  />
                  <View style={styles.modeSwitch}>
                    {(["per100g", "perServing"] as NutrientMode[]).map((m) => {
                      const on = nutrientMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => !busy && handleNutrientModeChange(m)}
                          style={[styles.modeChip, on && styles.modeChipOn]}
                        >
                          <Text
                            style={[styles.modeChipText, on && styles.modeChipTextOn]}
                            numberOfLines={1}
                          >
                            {m === "per100g" ? "100gあたり" : `1回分（${Number.isNaN(gramsNum) ? "?" : gramsNum}g）`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Text style={styles.label}>栄養素</Text>
                <View style={styles.pfcGrid}>
                  {(
                    [
                      { label: "P タンパク質", raw: rawP, display: displayP, setRaw: setRawP, field: "p" as const },
                      { label: "F 脂質", raw: rawF, display: displayF, setRaw: setRawF, field: "f" as const },
                      { label: "C 糖質", raw: rawC, display: displayC, setRaw: setRawC, field: "c" as const },
                    ] as const
                  ).map(({ label, raw, display, setRaw, field }) => (
                    <View key={field} style={styles.pfcCell}>
                      <Text style={styles.pfcCellLabel}>{label}</Text>
                      <TextInput
                        value={raw ?? display}
                        onChangeText={(t) => setRaw(t)}
                        onEndEditing={(e) =>
                          commitNutrientFromText(field, e.nativeEvent.text)
                        }
                        placeholder="—"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="decimal-pad"
                        style={styles.pfcInput}
                        editable={!busy}
                      />
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>ランク</Text>
                <View style={styles.rankRow}>
                  {RANK_OPTIONS.map((opt) => {
                    const on = rank === opt.value;
                    return (
                      <View key={opt.value} style={styles.rankCell}>
                        <Pressable
                          onPress={() => !busy && setRank(opt.value)}
                          style={[styles.rankBtn, on && styles.rankBtnOn]}
                          disabled={busy}
                        >
                          <Text
                            style={[styles.rankBtnText, on && styles.rankBtnTextOn]}
                            numberOfLines={2}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>グループ名（任意）</Text>
                <View style={styles.groupRow}>
                  <TextInput
                    value={groupName}
                    onChangeText={(t) => {
                      setGroupName(t);
                      if (!groupSuggestOpen) setGroupSuggestOpen(true);
                    }}
                    placeholder="例: ホルモン系"
                    placeholderTextColor={COLORS.textMuted}
                    style={[styles.input, styles.groupInput]}
                    editable={!busy}
                  />
                  {existingGroupNames.length > 0 ? (
                    <Pressable
                      onPress={() => setGroupSuggestOpen((v) => !v)}
                      style={styles.candidateBtn}
                    >
                      <Text style={styles.candidateBtnText}>候補</Text>
                    </Pressable>
                  ) : null}
                </View>
                {existingGroupNames.length > 0 && groupSuggestOpen ? (
                  <View style={styles.suggestBox}>
                    <ScrollView
                      style={styles.suggestScroll}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {existingGroupNames.map((g) => (
                        <Pressable
                          key={g}
                          onPress={() => {
                            setGroupName(g);
                            setGroupSuggestOpen(false);
                          }}
                          style={styles.suggestRow}
                        >
                          <Text style={styles.suggestRowText}>{g}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>メモ（任意）</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="例: 1切れ約15g"
                  placeholderTextColor={COLORS.textMuted}
                  style={[styles.input, styles.textarea]}
                  multiline
                  numberOfLines={MEMO_MIN_ROWS}
                  editable={!busy}
                />
              </View>

              {isEdit ? (
                <View style={styles.shareQrSection}>
                  <Text style={styles.label}>共有（QR）</Text>
                  <Text style={styles.shareQrHint}>
                    入力中の内容を QR にします。相手は「メニューを追加」からカメラで読み取れます。
                  </Text>
                  {!shareQrImportItem ? (
                    <Text style={styles.amberSm}>名前を入力すると QR を表示できます。</Text>
                  ) : null}
                  {shareQrGenError ? <Text style={styles.amberSm}>{shareQrGenError}</Text> : null}
                  {shareQrPayload && !shareQrGenError ? (
                    <View style={styles.shareQrWhite}>
                      <QRCode
                        value={shareQrPayload}
                        size={200}
                        ecl="L"
                        color="#000000"
                        backgroundColor="#ffffff"
                        quietZone={4}
                        onError={(e: unknown) => {
                          setShareQrGenError(
                            e instanceof Error
                              ? `QRを生成できませんでした（${e.message}）。メモや名前を短くするか、項目を減らして保存内容を試してください。`
                              : "QRを生成できませんでした。メモや名前を短くしてください。"
                          );
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {!isEdit ? (
                <View style={styles.field}>
                  <Text style={styles.label}>食事（記録で使用）</Text>
                  <View style={styles.mealLogActionsRow}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.mealScrollForLog}
                      contentContainerStyle={styles.mealScrollForLogContent}
                      keyboardShouldPersistTaps="handled"
                    >
                      {MEALS.map((m) => (
                        <Pressable
                          key={m}
                          onPress={() => !busy && setLogMeal(m)}
                          style={[
                            styles.mealChip,
                            styles.mealChipCompact,
                            logMeal === m && styles.mealChipOn,
                            busy && { opacity: 0.5 },
                          ]}
                        >
                          <Text
                            style={[styles.mealChipText, logMeal === m && styles.mealChipTextOn]}
                          >
                            {MEAL_LABEL[m]}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Pressable
                      onPress={() => void handleLogOnly()}
                      disabled={busy || !snapshotRestaurantId}
                      style={[
                        styles.logNowBtn,
                        (!snapshotRestaurantId || busy) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.logNowBtnText} numberOfLines={2}>
                        今すぐ記録
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {formError ? <Text style={styles.error}>{formError}</Text> : null}

              {isEdit ? (
                <>
                  <Pressable
                    onPress={() => void handleSaveMenu()}
                    disabled={busy}
                    style={[styles.btnPrimaryWide, busy && { opacity: 0.55 }]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#022c22" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>保存する</Text>
                    )}
                  </Pressable>

                  <View style={styles.deleteSection}>
                    {confirmDelete ? (
                      <View style={styles.deleteConfirmRow}>
                        <Pressable
                          onPress={() => setConfirmDelete(false)}
                          style={[styles.btnGhostWide, { flex: 1 }]}
                        >
                          <Text style={styles.btnGhostText}>キャンセル</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleDelete()}
                          disabled={deleting}
                          style={[styles.btnDangerWide, { flex: 1 }, deleting && { opacity: 0.5 }]}
                        >
                          <Text style={styles.btnDangerText}>
                            {deleting ? "削除中…" : "削除する"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteLink}>
                        <Text style={styles.deleteLinkText}>このメニューを削除</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.registerBox}>
                    <Text style={styles.label}>メニュー登録先</Text>
                    {registerRestaurantsLoading ? (
                      <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
                    ) : registerRestaurants.length === 0 ? (
                      <Text style={styles.hint}>お店がありません。店舗を追加してください。</Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.registerChipScroll}
                      >
                        {registerRestaurants.map((r) => {
                          const on = r.id === registerRestaurantId;
                          return (
                            <Pressable
                              key={r.id}
                              onPress={() => !busy && setRegisterRestaurantId(r.id)}
                              style={[styles.registerChip, on && styles.registerChipOn]}
                            >
                              <Text
                                style={[styles.registerChipText, on && styles.registerChipTextOn]}
                                numberOfLines={1}
                              >
                                {r.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>

                  <Pressable
                    onPress={() => void handleSaveMenu()}
                    disabled={busy || !canRegisterMenu}
                    style={[styles.btnPrimaryWide, (busy || !canRegisterMenu) && { opacity: 0.55 }]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#022c22" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>メニューに登録</Text>
                    )}
                  </Pressable>
                  {!canRegisterMenu && !registerRestaurantsLoading ? (
                    <Text style={styles.hint}>
                      メニュー登録先のお店がないため、メニューへの登録はできません。
                    </Text>
                  ) : null}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    maxHeight: "92%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  headerCancel: {
    color: COLORS.textMuted,
    fontSize: 14,
    paddingTop: 2,
  },
  scrollPad: { paddingBottom: 32 },
  field: { marginBottom: 14 },
  barcodeSection: { marginBottom: 14 },
  barcodeValue: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 16,
  },
  gramsModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  gramsInlineLabel: {
    flexShrink: 0,
    color: COLORS.textMuted,
    fontSize: 12,
    maxWidth: "34%",
  },
  gramsInputRow: {
    width: 64,
    minWidth: 56,
    flexShrink: 0,
    paddingVertical: 8,
    paddingHorizontal: 8,
    textAlign: "center",
    fontSize: 15,
  },
  modeSwitch: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  modeChipOn: { backgroundColor: COLORS.primary },
  modeChipText: { color: COLORS.textMuted, fontSize: 10, textAlign: "center" },
  modeChipTextOn: { color: "#fff", fontWeight: "600" },
  pfcGrid: { flexDirection: "row", gap: 8 },
  pfcCell: { flex: 1 },
  pfcCellLabel: { color: COLORS.textMuted, fontSize: 11, marginBottom: 4 },
  pfcInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 15,
    textAlign: "center",
  },
  rankRow: { flexDirection: "row", flexWrap: "nowrap", gap: 6 },
  rankCell: { flex: 1, minWidth: 0 },
  rankBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  rankBtnOn: { borderColor: COLORS.primary, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  rankBtnText: { color: COLORS.textMuted, fontSize: 11, fontWeight: "500", textAlign: "center" },
  rankBtnTextOn: { color: "#fff", fontWeight: "600" },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupInput: { flex: 1 },
  candidateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  candidateBtnText: { color: COLORS.text, fontSize: 12 },
  suggestBox: {
    marginTop: 8,
    maxHeight: 280,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    overflow: "hidden",
  },
  suggestScroll: {
    maxHeight: 280,
  },
  suggestRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  suggestRowText: { color: COLORS.text, fontSize: 14 },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  shareQrSection: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    gap: 8,
  },
  shareQrHint: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  shareQrWhite: {
    alignSelf: "center",
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },
  amberSm: { fontSize: 12, color: "#fcd34d", lineHeight: 17 },
  mealLogActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mealScrollForLog: { flex: 1, minWidth: 0 },
  mealScrollForLogContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 4,
  },
  mealChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  mealChipOn: { borderColor: COLORS.primary, backgroundColor: "rgba(16, 185, 129, 0.15)" },
  mealChipCompact: { paddingVertical: 6, paddingHorizontal: 10 },
  mealChipText: { color: COLORS.textMuted, fontSize: 12 },
  mealChipTextOn: { color: "#a7f3d0", fontWeight: "600" },
  logNowBtn: {
    width: 88,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  logNowBtnText: {
    color: "#a7f3d0",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },
  error: { color: "#fecaca", fontSize: 13, marginBottom: 10 },
  registerBox: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  registerChipScroll: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  registerChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
    maxWidth: 200,
  },
  registerChipOn: { borderColor: COLORS.primary, backgroundColor: "rgba(16, 185, 129, 0.15)" },
  registerChipText: { color: COLORS.textMuted, fontSize: 13 },
  registerChipTextOn: { color: "#a7f3d0", fontWeight: "600" },
  btnPrimaryWide: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    minHeight: 48,
    marginBottom: 10,
  },
  btnPrimaryText: { color: "#022c22", fontWeight: "700", fontSize: 16 },
  deleteSection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  deleteConfirmRow: { flexDirection: "row", gap: 8 },
  btnGhostWide: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: { color: COLORS.text, fontWeight: "600" },
  btnDangerWide: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.danger,
  },
  btnDangerText: { color: "#fff", fontWeight: "700" },
  deleteLink: { paddingVertical: 10 },
  deleteLinkText: { color: "#f87171", fontSize: 14, textAlign: "center" },
});
