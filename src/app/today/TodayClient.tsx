"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { FoodLogEntry, MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import {
  saveMealToLog,
  updateMenuItem,
  addMenuItem,
  deleteMenuItem,
  addRestaurant,
  deleteRestaurant,
  importRestaurantData,
  importMenuItemsToRestaurant,
  getFoodLogForDate,
  deleteFoodLogEntry,
  updateFoodLogEntry,
  updateUserSettings,
  type MenuItemUpdate,
  type ImportData,
  type ImportRestaurantItem,
} from "./actions";

// ─── 型 ────────────────────────────────────────────────────────────────────────

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

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

type CartEntry = { item: MenuItem; count: number; gramsPerServing: number };
type NutrientMode = "per100g" | "perServing";

// ドロワーの種別
type ItemDrawerState =
  | { kind: "edit"; item: MenuItem }
  | { kind: "add"; restaurantId: string };

// ─── ユーティリティ ────────────────────────────────────────────────────────────

function getCurrentMealType(): MealType {
  const h = new Date().getHours();
  if (h >= 6 && h < 10) return "breakfast";
  if (h >= 10 && h < 15) return "lunch";
  if (h >= 15 && h < 22) return "dinner";
  return "snack";
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

// ─── PFCバー ──────────────────────────────────────────────────────────────────

function PFCBar({ label, current, target, color }: {
  label: string; current: number; target: number; color: string;
}) {
  const pct = Math.min((current / target) * 100, 100);
  const over = current > target;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-4 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${over ? "bg-red-500" : color}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums w-16 text-right ${over ? "text-red-400" : "text-gray-300"}`}>
        {fmt(current)}/{target}g
      </span>
    </div>
  );
}

// ─── メニューアイテム追加・編集ドロワー ────────────────────────────────────────

function MenuItemDrawer({
  state,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: ItemDrawerState;
  onClose: () => void;
  onSaved: (item: MenuItem) => void;
  onDeleted?: (id: string) => void;
}) {
  const isEdit = state.kind === "edit";
  const existing = isEdit ? state.item : null;

  const [name, setName]       = useState(existing?.name ?? "");
  const [protein, setProtein] = useState(existing?.protein_per_100g?.toString() ?? "");
  const [fat, setFat]         = useState(existing?.fat_per_100g?.toString() ?? "");
  const [carbs, setCarbs]     = useState(existing?.carbs_per_100g?.toString() ?? "");
  const [grams, setGrams]     = useState(existing?.default_grams?.toString() ?? "100");
  const [rank, setRank]           = useState(existing?.rank ?? 2);
  const [groupName, setGroupName] = useState(existing?.group_name ?? "");
  const [notes, setNotes]         = useState(existing?.notes ?? "");
  const [mode, setMode]       = useState<NutrientMode>("per100g");
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const displayP = mode === "per100g" ? protein : toServing(protein, grams);
  const displayF = mode === "per100g" ? fat     : toServing(fat,     grams);
  const displayC = mode === "per100g" ? carbs   : toServing(carbs,   grams);

  function handleNutrientChange(field: "p" | "f" | "c", val: string) {
    const stored = mode === "per100g" ? val : to100g(val, grams);
    if (field === "p") setProtein(stored);
    if (field === "f") setFat(stored);
    if (field === "c") setCarbs(stored);
  }

  async function handleSave() {
    if (!name.trim()) { setError("名前を入力してください"); return; }
    setSaving(true); setError(null);
    const data: MenuItemUpdate = {
      name: name.trim(),
      protein_per_100g: protein === "" ? null : parseFloat(protein),
      fat_per_100g:     fat     === "" ? null : parseFloat(fat),
      carbs_per_100g:   carbs   === "" ? null : parseFloat(carbs),
      default_grams: parseFloat(grams) || 100,
      rank,
      notes: notes.trim() || null,
      group_name: groupName.trim() || null,
    };

    if (isEdit && existing) {
      const result = await updateMenuItem(existing.id, data);
      if (result.error) { setError(result.error); setSaving(false); return; }
      onSaved({ ...existing, ...data });
    } else {
      const restaurantId = state.kind === "add" ? state.restaurantId : "";
      const result = await addMenuItem(restaurantId, data);
      if (result.error || !result.data) { setError(result.error ?? "追加に失敗しました"); setSaving(false); return; }
      onSaved(result.data);
    }
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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl max-w-md mx-auto border-x border-t border-gray-700 max-h-[85svh] flex flex-col">
        <div className="flex-none flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex-none flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? "メニュー編集" : "メニューを追加"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">
            キャンセル
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">名前</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              autoFocus={!isEdit}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">1回の量（g）</label>
            <input type="number" value={grams} onChange={(e) => setGrams(e.target.value)}
              className="w-28 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">栄養素</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
                {(["per100g", "perServing"] as NutrientMode[]).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-2.5 py-1 transition-colors ${mode === m ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                    {m === "per100g" ? "100gあたり" : `1回分（${isNaN(gramsNum) ? "?" : gramsNum}g）`}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "P タンパク質", display: displayP, field: "p" as const },
                { label: "F 脂質",       display: displayF, field: "f" as const },
                { label: "C 糖質",       display: displayC, field: "c" as const },
              ].map(({ label, display, field }) => (
                <div key={field}>
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <input type="number" value={display} placeholder="—"
                    onChange={(e) => handleNutrientChange(field, e.target.value)}
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm text-center focus:outline-none focus:border-emerald-500" />
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
              placeholder="例: ホルモン系"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">メモ（任意）</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="例: 1切れ約15g"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
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
        </div>

        <div className="flex-none px-4 py-4 border-t border-gray-800">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
            {saving ? "保存中..." : isEdit ? "保存する" : "追加する"}
          </button>
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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl max-w-md mx-auto border-x border-t border-gray-700 flex flex-col">
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
    "menuItems[].default_grams": "number (必須, 1以上) — 1回分のデフォルト重量 (g)",
    "menuItems[].rank": "1〜4の整数 (必須) — 1=◎最優先 / 2=○通常 / 3=△控えめ / 4=✕避ける",
    "menuItems[].notes": "string or null — メモ（任意）",
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
        default_grams: 100,
        rank: 2,
        notes: null,
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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700">
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

const PRESET_BASE = "https://raw.githubusercontent.com/kzkski/ketolog/main/presets";

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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[80svh]">
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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[70svh]">
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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[70svh]">
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

function MenuItemRow({ item, entry, onAdd, onRemove, onChangeGrams, onEdit }: {
  item: MenuItem; entry: CartEntry | undefined;
  onAdd: () => void; onRemove: () => void;
  onChangeGrams: (g: number) => void; onEdit: () => void;
}) {
  const [editingGrams, setEditingGrams] = useState(false);
  const [gramsInput, setGramsInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayGrams = entry?.gramsPerServing ?? item.default_grams;
  const serving = pfc(item, displayGrams);
  const count = entry?.count ?? 0;
  const rank = RANK_ICON[item.rank] ?? RANK_ICON[2];

  function startGramsEdit() {
    setGramsInput(displayGrams.toString());
    setEditingGrams(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitGramsEdit() {
    const val = parseFloat(gramsInput);
    if (!isNaN(val) && val > 0) onChangeGrams(val);
    setEditingGrams(false);
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/60">
      <span className={`text-xs shrink-0 w-4 ${rank.className}`}>{rank.icon}</span>
      <button className="flex-1 min-w-0 text-left" onClick={onEdit}>
        <p className="text-sm text-white truncate">{item.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.protein_per_100g !== null
            ? `P${fmt(serving.p)} F${fmt(serving.f)} C${fmt(serving.c)}`
            : "PFC未設定 — タップして編集"}
        </p>
      </button>

      <div className="shrink-0">
        {editingGrams ? (
          <input ref={inputRef} type="number" value={gramsInput}
            onChange={(e) => setGramsInput(e.target.value)}
            onBlur={commitGramsEdit}
            onKeyDown={(e) => e.key === "Enter" && commitGramsEdit()}
            className="w-14 text-center text-sm bg-gray-800 border border-emerald-500 rounded px-1 py-0.5 text-white" />
        ) : (
          <button onClick={startGramsEdit}
            className="text-xs text-gray-400 hover:text-white transition-colors px-1 py-1">
            {displayGrams}g
          </button>
        )}
      </div>

      {count === 0 ? (
        <button onClick={onAdd}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-bold shrink-0">
          +
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white">−</button>
          <span className="w-5 text-center text-sm font-bold text-emerald-400 tabular-nums">{count}</span>
          <button onClick={onAdd}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white">+</button>
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
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/40">
      <span className="flex-1 text-sm text-white truncate">{entry.item_name}</span>
      <span className="text-xs text-gray-400 shrink-0">{entry.grams}g</span>
      <span className="text-xs text-gray-500 shrink-0 tabular-nums w-28 text-right">
        P{fmt(entry.protein_g)} F{fmt(entry.fat_g)} C{fmt(entry.carbs_g)}
      </span>
      <button onClick={onEdit} className="text-gray-400 hover:text-white text-xs px-1 shrink-0">✎</button>
      <button onClick={onDelete} className="text-red-400 hover:text-red-300 text-xs px-1 shrink-0">✕</button>
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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col">
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
                <button key={t} onClick={() => setMealType(t)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${mealType === t ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                  {MEAL_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">グラム数</label>
            <input type="number" value={grams} onChange={(e) => setGrams(e.target.value)}
              className="w-28 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
            {preview && (
              <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                → P{fmt(preview.p)} / F{fmt(preview.f)} / C{fmt(preview.c)}g
              </p>
            )}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <div className="px-4 py-4 border-t border-gray-800">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm">
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
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl border-x border-t border-gray-700 flex flex-col max-h-[80svh]">
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

// ─── メインコンポーネント ───────────────────────────────────────────────────────

interface Props {
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  settings: UserSettings;
  todayConsumed: TodayConsumed;
  today: string;
  initialLogEntries: FoodLogEntry[];
  presets: { name: string; file: string; itemCount: number }[];
}

export default function TodayClient({
  restaurants: initialRestaurants,
  menuItems: initialMenuItems,
  settings,
  todayConsumed,
  today,
  initialLogEntries,
  presets,
}: Props) {
  const router = useRouter();
  const [currentSettings, setCurrentSettings] = useState<UserSettings>(settings);
  const [showSettings, setShowSettings]       = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialRestaurants);
  const [menuItems, setMenuItems]     = useState<MenuItem[]>(initialMenuItems);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(initialRestaurants[0]?.id ?? "");
  const [cart, setCart]             = useState<Map<string, CartEntry>>(new Map());
  const [mealType, setMealType]     = useState<MealType>(getCurrentMealType());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["控えめ", "避ける"]));
  const [saving, setSaving]         = useState(false);
  const [cartExpanded, setCartExpanded] = useState(true);
  const [itemDrawer, setItemDrawer] = useState<ItemDrawerState | null>(null);
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

  const selectedRestaurant = restaurants.find((r) => r.id === selectedRestaurantId);

  // ── カート計算 ──────────────────────────────────────────────────────────────
  const cartPFC = useMemo(() => {
    let p = 0, f = 0, c = 0;
    cart.forEach((entry) => {
      const g = entry.gramsPerServing * entry.count;
      p += (entry.item.protein_per_100g ?? 0) * g / 100;
      f += (entry.item.fat_per_100g ?? 0) * g / 100;
      c += (entry.item.carbs_per_100g ?? 0) * g / 100;
    });
    return { p, f, c };
  }, [cart]);

  const totalPFC = {
    p: consumedForDate.protein + cartPFC.p,
    f: consumedForDate.fat + cartPFC.f,
    c: consumedForDate.carbs + cartPFC.c,
  };

  const cartEntries = useMemo(() => Array.from(cart.values()).filter((e) => e.count > 0), [cart]);
  const hasCart = cartEntries.length > 0;

  // ── メニュー表示 ────────────────────────────────────────────────────────────
  type MenuGroup = { groupName: string | null; groupOrder: number; items: MenuItem[] };

  const menuGroups = useMemo((): MenuGroup[] => {
    const items = menuItems.filter((item) => item.restaurant_id === selectedRestaurantId);
    const groupMap = new Map<string | null, MenuGroup>();

    for (const item of items) {
      const key = item.group_name;
      if (!groupMap.has(key)) {
        groupMap.set(key, { groupName: key, groupOrder: item.group_order, items: [] });
      }
      groupMap.get(key)!.items.push(item);
    }

    return Array.from(groupMap.values())
      .sort((a, b) => {
        if (a.groupName === null) return -1;
        if (b.groupName === null) return 1;
        return a.groupOrder - b.groupOrder;
      });
  }, [menuItems, selectedRestaurantId]);

  // ── カート操作 ──────────────────────────────────────────────────────────────
  function addItem(item: MenuItem) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing) next.set(item.id, { ...existing, count: existing.count + 1 });
      else next.set(item.id, { item, count: 1, gramsPerServing: item.default_grams });
      return next;
    });
  }

  function removeItem(itemId: string) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      if (existing.count <= 1) next.delete(itemId);
      else next.set(itemId, { ...existing, count: existing.count - 1 });
      return next;
    });
  }

  function updateGrams(itemId: string, grams: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
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
    // カートにあれば更新
    setCart((prev) => {
      const entry = prev.get(saved.id);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(saved.id, { ...entry, item: saved, gramsPerServing: saved.default_grams });
      return next;
    });
  }

  function handleItemDeleted(id: string) {
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
    setCart((prev) => { const next = new Map(prev); next.delete(id); return next; });
  }

  // ── お店の削除 ──────────────────────────────────────────────────────────────
  async function handleDeleteRestaurant() {
    if (!selectedRestaurant) return;
    setDeletingRestaurant(true);
    const result = await deleteRestaurant(selectedRestaurant.id);
    if (result.error) { alert(result.error); setDeletingRestaurant(false); return; }
    const next = restaurants.filter((r) => r.id !== selectedRestaurant.id);
    setRestaurants(next);
    setMenuItems((prev) => prev.filter((m) => m.restaurant_id !== selectedRestaurant.id));
    setSelectedRestaurantId(next[0]?.id ?? "");
    setConfirmDeleteRestaurant(false);
    setDeletingRestaurant(false);
  }

  // ── 日付ナビ ────────────────────────────────────────────────────────────────
  async function navigateDate(delta: number) {
    const newDate = addDays(selectedDate, delta);
    if (newDate > today) return;
    setSelectedDate(newDate);
    setLoadingDate(true);
    const result = await getFoodLogForDate(newDate);
    setLoadingDate(false);
    if (!result.error) {
      setConsumedForDate(result.consumed);
      setLogEntries(result.entries);
      setShowLogEntries(newDate !== today);
    }
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
    setSaving(true);
    const items = cartEntries.map((entry) => {
      const totalGrams = entry.gramsPerServing * entry.count;
      const v = pfc(entry.item, totalGrams);
      return { menuItemId: entry.item.id, name: entry.item.name, totalGrams, proteinG: v.p, fatG: v.f, carbsG: v.c, restaurantId: entry.item.restaurant_id };
    });
    const { error } = await saveMealToLog(items, mealType, selectedDate);
    if (error) { alert(`保存に失敗しました: ${error}`); setSaving(false); return; }
    setCart(new Map());
    await refreshLogForDate(selectedDate);
    setSaving(false);
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ヘッダー */}
      <header className="flex-none flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h1 className="text-base font-bold text-white">
          Ketolog
          <span className="text-xs font-normal text-gray-500 ml-1.5">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        </h1>
        <button onClick={() => setShowSettings(true)}
          className="text-gray-400 hover:text-white transition-colors text-lg leading-none px-1">
          ⚙
        </button>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        {/* 日付ナビゲーション */}
        <div className="flex-none flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
          <button onClick={() => navigateDate(-1)} disabled={loadingDate}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 transition-colors text-lg">
            ‹
          </button>
          <span className="text-sm font-medium text-white">
            {loadingDate ? "読込中..." : formatNavDate(selectedDate, today)}
          </span>
          <button onClick={() => navigateDate(1)} disabled={selectedDate >= today || loadingDate}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 transition-colors text-lg">
            ›
          </button>
        </div>

        {/* PFCバー */}
        <div className="flex-none px-4 py-3 bg-gray-900 border-b border-gray-800 space-y-1.5">
          <PFCBar label="P" current={totalPFC.p} target={currentSettings.protein_target_g} color="bg-blue-500" />
          <PFCBar label="F" current={totalPFC.f} target={currentSettings.fat_target_g}     color="bg-yellow-500" />
          <PFCBar label="C" current={totalPFC.c} target={currentSettings.carbs_target_g}   color="bg-emerald-500" />
        </div>

        {/* 記録済みパネル */}
        {logEntries.length > 0 && (
          <div className="flex-none border-b border-gray-800">
            <button onClick={() => setShowLogEntries((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors">
              <span>この日の記録（{logEntries.length}件）</span>
              <span>{showLogEntries ? "▲" : "▼"}</span>
            </button>
            {showLogEntries && (
              <div className="max-h-52 overflow-y-auto">
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((mt) => {
                  const items = logEntries.filter((e) => e.meal_type === mt);
                  if (!items.length) return null;
                  return (
                    <div key={mt}>
                      <p className="px-4 py-1 text-xs text-gray-500 bg-gray-900/50">{MEAL_LABELS[mt]}</p>
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

        {/* 食事タイプ タブ */}
        <div className="flex-none flex border-b border-gray-800 bg-gray-900">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((type) => {
            const activeColors: Record<MealType, string> = {
              breakfast: "border-rose-400 text-rose-300 bg-rose-400/10",
              lunch:     "border-cyan-400 text-cyan-300 bg-cyan-400/10",
              dinner:    "border-violet-400 text-violet-300 bg-violet-400/10",
              snack:     "border-teal-400 text-teal-300 bg-teal-400/10",
            };
            return (
              <button key={type} onClick={() => setMealType(type)}
                className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${mealType === type ? activeColors[type] : "border-transparent text-gray-500 hover:text-gray-300"}`}>
                {MEAL_LABELS[type]}
              </button>
            );
          })}
        </div>

        {/* レストラン タブ + 追加ボタン */}
        <div className="flex-none flex border-b border-gray-800 overflow-x-auto">
          {restaurants.map((r) => (
            <button key={r.id} onClick={() => { setSelectedRestaurantId(r.id); setConfirmDeleteRestaurant(false); }}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${selectedRestaurantId === r.id ? "border-emerald-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {r.name}
            </button>
          ))}
          <button onClick={() => setRestaurantAddSheet("choice")}
            className="px-3 py-2.5 text-gray-500 hover:text-white shrink-0 transition-colors text-lg leading-none">
            ＋
          </button>
        </div>

        {/* メニューリスト */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {menuGroups.map((group) => {
            if (group.groupName === null) {
              return group.items.map((item) => (
                <MenuItemRow key={item.id} item={item} entry={cart.get(item.id)}
                  onAdd={() => addItem(item)} onRemove={() => removeItem(item.id)}
                  onChangeGrams={(g) => updateGrams(item.id, g)}
                  onEdit={() => setItemDrawer({ kind: "edit", item })} />
              ));
            }
            const isCollapsed = collapsedGroups.has(group.groupName);
            const cartCount = group.items.reduce((n, item) => n + (cart.get(item.id)?.count ?? 0), 0);
            return (
              <div key={group.groupName}>
                <button
                  onClick={() => setCollapsedGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.groupName!)) next.delete(group.groupName!);
                    else next.add(group.groupName!);
                    return next;
                  })}
                  className="w-full flex items-center justify-between px-4 py-2 text-gray-400 text-xs bg-gray-900/50 border-b border-gray-800/60 hover:text-gray-200 transition-colors">
                  <span className="flex items-center gap-1.5">
                    <span>{isCollapsed ? "▶" : "▼"}</span>
                    <span>{group.groupName}（{group.items.length}品）</span>
                    {isCollapsed && cartCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-emerald-600 text-white rounded-full text-xs leading-none">{cartCount}</span>
                    )}
                  </span>
                </button>
                {!isCollapsed && group.items.map((item) => (
                  <MenuItemRow key={item.id} item={item} entry={cart.get(item.id)}
                    onAdd={() => addItem(item)} onRemove={() => removeItem(item.id)}
                    onChangeGrams={(g) => updateGrams(item.id, g)}
                    onEdit={() => setItemDrawer({ kind: "edit", item })} />
                ))}
              </div>
            );
          })}

          {/* メニュー追加 & お店削除 */}
          {selectedRestaurantId && (
            <div className="px-4 py-3 space-y-2 border-t border-gray-800/60 mt-1">
              <button
                onClick={() => setItemDrawer({ kind: "add", restaurantId: selectedRestaurantId })}
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

              {/* 自炊（homemade）以外のお店だけ削除可能 */}
              {selectedRestaurant && selectedRestaurant.category !== "homemade" && (
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

          {menuGroups.every((g) => g.items.length === 0) && selectedRestaurantId && (
            <p className="text-center text-gray-500 text-sm py-8">
              メニューがまだありません
            </p>
          )}
        </div>

        {/* カートパネル */}
        {hasCart && (
          <div className="flex-none border-t border-gray-700 bg-gray-900">
            <button onClick={() => setCartExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-white">カート（{cartEntries.length}品）</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 tabular-nums">
                  P{fmt(cartPFC.p)} F{fmt(cartPFC.f)} C{fmt(cartPFC.c)}
                </span>
                <span className="text-gray-400 text-xs">{cartExpanded ? "▼" : "▲"}</span>
              </div>
            </button>
            {cartExpanded && (
              <>
                <div className="max-h-36 overflow-y-auto border-t border-gray-800">
                  {cartEntries.map((entry) => {
                    const totalGrams = entry.gramsPerServing * entry.count;
                    const v = pfc(entry.item, totalGrams);
                    return (
                      <div key={entry.item.id} className="flex items-center justify-between px-4 py-1.5 border-b border-gray-800/50">
                        <span className="text-sm text-gray-200 truncate flex-1">
                          {entry.item.name}
                          <span className="text-gray-500 ml-1 text-xs">×{entry.count}（{totalGrams}g）</span>
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 ml-2 tabular-nums">
                          P{fmt(v.p)} F{fmt(v.f)} C{fmt(v.c)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-300 tabular-nums">
                    合計 P<span className="text-white font-medium">{fmt(cartPFC.p)}</span>{" "}
                    F<span className="text-white font-medium">{fmt(cartPFC.f)}</span>{" "}
                    C<span className="text-white font-medium">{fmt(cartPFC.c)}</span>g
                  </div>
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0">
                    {saving ? "記録中..." : "記録する"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* メニュー追加・編集ドロワー */}
      {itemDrawer && (
        <MenuItemDrawer
          state={itemDrawer}
          onClose={() => setItemDrawer(null)}
          onSaved={handleItemSaved}
          onDeleted={itemDrawer.kind === "edit" ? handleItemDeleted : undefined}
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
            setRestaurants((prev) => [...prev, r]);
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
            setRestaurants((prev) => [...prev, restaurant]);
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
            setRestaurants((prev) => [...prev, restaurant]);
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
