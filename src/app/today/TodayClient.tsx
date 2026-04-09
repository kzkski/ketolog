"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";
import {
  saveMealToLog,
  updateMenuItem,
  addMenuItem,
  deleteMenuItem,
  addRestaurant,
  deleteRestaurant,
  type MenuItemUpdate,
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
  const [rank, setRank]       = useState(existing?.rank ?? 2);
  const [notes, setNotes]     = useState(existing?.notes ?? "");
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

// ─── メインコンポーネント ───────────────────────────────────────────────────────

interface Props {
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  settings: UserSettings;
  todayConsumed: TodayConsumed;
  today: string;
}

export default function TodayClient({
  restaurants: initialRestaurants,
  menuItems: initialMenuItems,
  settings,
  todayConsumed,
  today,
}: Props) {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialRestaurants);
  const [menuItems, setMenuItems]     = useState<MenuItem[]>(initialMenuItems);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(initialRestaurants[0]?.id ?? "");
  const [cart, setCart]             = useState<Map<string, CartEntry>>(new Map());
  const [mealType, setMealType]     = useState<MealType>(getCurrentMealType());
  const [showRank3, setShowRank3]   = useState(false);
  const [showRank4, setShowRank4]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [cartExpanded, setCartExpanded] = useState(true);
  const [itemDrawer, setItemDrawer] = useState<ItemDrawerState | null>(null);
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [deletingRestaurant, setDeletingRestaurant] = useState(false);
  const [confirmDeleteRestaurant, setConfirmDeleteRestaurant] = useState(false);

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
    p: todayConsumed.protein + cartPFC.p,
    f: todayConsumed.fat + cartPFC.f,
    c: todayConsumed.carbs + cartPFC.c,
  };

  const cartEntries = useMemo(() => Array.from(cart.values()).filter((e) => e.count > 0), [cart]);
  const hasCart = cartEntries.length > 0;

  // ── メニュー表示 ────────────────────────────────────────────────────────────
  const visibleItems = useMemo(() => {
    return menuItems
      .filter((item) => item.restaurant_id === selectedRestaurantId)
      .sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : b.order_count - a.order_count);
  }, [menuItems, selectedRestaurantId]);

  const rank1and2 = visibleItems.filter((i) => i.rank <= 2);
  const rank3     = visibleItems.filter((i) => i.rank === 3);
  const rank4     = visibleItems.filter((i) => i.rank === 4);

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

  // ── 食事記録保存 ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!hasCart || saving) return;
    setSaving(true);
    const items = cartEntries.map((entry) => {
      const totalGrams = entry.gramsPerServing * entry.count;
      const v = pfc(entry.item, totalGrams);
      return { menuItemId: entry.item.id, name: entry.item.name, totalGrams, proteinG: v.p, fatG: v.f, carbsG: v.c, restaurantId: entry.item.restaurant_id };
    });
    const { error } = await saveMealToLog(items, mealType, today);
    if (error) { alert(`保存に失敗しました: ${error}`); setSaving(false); return; }
    setCart(new Map());
    setSaving(false);
    router.refresh();
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        {/* PFCバー */}
        <div className="flex-none px-4 py-3 bg-gray-900 border-b border-gray-800 space-y-1.5">
          <PFCBar label="P" current={totalPFC.p} target={settings.protein_target_g} color="bg-blue-500" />
          <PFCBar label="F" current={totalPFC.f} target={settings.fat_target_g}     color="bg-yellow-500" />
          <PFCBar label="C" current={totalPFC.c} target={settings.carbs_target_g}   color="bg-emerald-500" />
        </div>

        {/* 食事タイプ タブ */}
        <div className="flex-none flex border-b border-gray-800">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((type) => (
            <button key={type} onClick={() => setMealType(type)}
              className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${mealType === type ? "border-emerald-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {MEAL_LABELS[type]}
            </button>
          ))}
        </div>

        {/* レストラン タブ + 追加ボタン */}
        <div className="flex-none flex border-b border-gray-800 overflow-x-auto">
          {restaurants.map((r) => (
            <button key={r.id} onClick={() => { setSelectedRestaurantId(r.id); setConfirmDeleteRestaurant(false); }}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${selectedRestaurantId === r.id ? "border-emerald-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {r.name}
            </button>
          ))}
          <button onClick={() => setShowAddRestaurant(true)}
            className="px-3 py-2.5 text-gray-500 hover:text-white shrink-0 transition-colors text-lg leading-none">
            ＋
          </button>
        </div>

        {/* メニューリスト */}
        <div className="flex-1 overflow-y-auto">
          {rank1and2.map((item) => (
            <MenuItemRow key={item.id} item={item} entry={cart.get(item.id)}
              onAdd={() => addItem(item)} onRemove={() => removeItem(item.id)}
              onChangeGrams={(g) => updateGrams(item.id, g)}
              onEdit={() => setItemDrawer({ kind: "edit", item })} />
          ))}

          {rank3.length > 0 && (
            <>
              <button onClick={() => setShowRank3((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-amber-400 text-xs bg-gray-900/50 border-b border-gray-800/60">
                <span>△ 控えめ（{rank3.length}品）</span>
                <span>{showRank3 ? "▲" : "▼"}</span>
              </button>
              {showRank3 && rank3.map((item) => (
                <MenuItemRow key={item.id} item={item} entry={cart.get(item.id)}
                  onAdd={() => addItem(item)} onRemove={() => removeItem(item.id)}
                  onChangeGrams={(g) => updateGrams(item.id, g)}
                  onEdit={() => setItemDrawer({ kind: "edit", item })} />
              ))}
            </>
          )}

          {rank4.length > 0 && (
            <>
              <button onClick={() => setShowRank4((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-red-400 text-xs bg-gray-900/50 border-b border-gray-800/60">
                <span>✕ 避ける（{rank4.length}品）</span>
                <span>{showRank4 ? "▲" : "▼"}</span>
              </button>
              {showRank4 && rank4.map((item) => (
                <MenuItemRow key={item.id} item={item} entry={cart.get(item.id)}
                  onAdd={() => addItem(item)} onRemove={() => removeItem(item.id)}
                  onChangeGrams={(g) => updateGrams(item.id, g)}
                  onEdit={() => setItemDrawer({ kind: "edit", item })} />
              ))}
            </>
          )}

          {/* メニュー追加 & お店削除 */}
          {selectedRestaurantId && (
            <div className="px-4 py-3 space-y-2 border-t border-gray-800/60 mt-1">
              <button
                onClick={() => setItemDrawer({ kind: "add", restaurantId: selectedRestaurantId })}
                className="w-full py-2 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors">
                ＋ メニューを追加
              </button>

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

          {visibleItems.length === 0 && selectedRestaurantId && (
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

      {/* お店追加ドロワー */}
      {showAddRestaurant && (
        <AddRestaurantDrawer
          onClose={() => setShowAddRestaurant(false)}
          onAdded={(r) => {
            setRestaurants((prev) => [...prev, r]);
            setSelectedRestaurantId(r.id);
          }}
        />
      )}
    </>
  );
}
