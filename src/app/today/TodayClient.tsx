"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";
import { saveMealToLog, updateMenuItem, type MenuItemUpdate } from "./actions";

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

type CartEntry = {
  item: MenuItem;
  count: number;
  gramsPerServing: number;
};

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

// ─── PFCバー ──────────────────────────────────────────────────────────────────

function PFCBar({
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
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-4 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${over ? "bg-red-500" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums w-16 text-right ${over ? "text-red-400" : "text-gray-300"}`}>
        {fmt(current)}/{target}g
      </span>
    </div>
  );
}

// ─── メニューアイテム編集ドロワー ──────────────────────────────────────────────

type NutrientMode = "per100g" | "perServing";

// per-100g ↔ per-serving 換算
function to100g(val: string, gramsStr: string): string {
  const v = parseFloat(val);
  const g = parseFloat(gramsStr);
  if (isNaN(v) || isNaN(g) || g === 0) return val;
  return parseFloat((v * 100 / g).toFixed(2)).toString();
}

function toServing(val: string, gramsStr: string): string {
  const v = parseFloat(val);
  const g = parseFloat(gramsStr);
  if (isNaN(v) || isNaN(g)) return val;
  return parseFloat((v * g / 100).toFixed(2)).toString();
}

function EditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  onClose: () => void;
  onSaved: (updated: MenuItem) => void;
}) {
  const [name, setName] = useState(item.name);
  // 内部は常に per-100g で保持
  const [protein, setProtein] = useState(item.protein_per_100g?.toString() ?? "");
  const [fat, setFat] = useState(item.fat_per_100g?.toString() ?? "");
  const [carbs, setCarbs] = useState(item.carbs_per_100g?.toString() ?? "");
  const [grams, setGrams] = useState(item.default_grams.toString());
  const [rank, setRank] = useState(item.rank);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [mode, setMode] = useState<NutrientMode>("per100g");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表示値（モードに応じて換算）
  const displayP = mode === "per100g" ? protein : toServing(protein, grams);
  const displayF = mode === "per100g" ? fat    : toServing(fat,     grams);
  const displayC = mode === "per100g" ? carbs  : toServing(carbs,   grams);

  function handleNutrientChange(field: "p" | "f" | "c", val: string) {
    // 入力値を per-100g に換算して内部ステートに保存
    const stored = mode === "per100g" ? val : to100g(val, grams);
    if (field === "p") setProtein(stored);
    if (field === "f") setFat(stored);
    if (field === "c") setCarbs(stored);
  }

  function switchMode(next: NutrientMode) {
    // モード変更時は値の再換算不要（displayX で都度換算するため）
    setMode(next);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const data: MenuItemUpdate = {
      name: name.trim() || item.name,
      protein_per_100g: protein === "" ? null : parseFloat(protein),
      fat_per_100g:     fat     === "" ? null : parseFloat(fat),
      carbs_per_100g:   carbs   === "" ? null : parseFloat(carbs),
      default_grams: parseFloat(grams) || item.default_grams,
      rank,
      notes: notes.trim() || null,
    };
    const result = await updateMenuItem(item.id, data);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onSaved({ ...item, ...data });
    onClose();
  }

  const gramsNum = parseFloat(grams);
  const modeLabel = mode === "per100g"
    ? "100gあたり"
    : `1回分あたり（${isNaN(gramsNum) ? "?" : gramsNum}g）`;

  return (
    <>
      {/* オーバーレイ */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      {/* ドロワー */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-2xl max-w-md mx-auto border-x border-t border-gray-700 max-h-[85svh] flex flex-col">
        {/* ハンドル */}
        <div className="flex-none flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex-none flex items-center justify-between px-4 pb-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">メニュー編集</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">
            キャンセル
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 名前 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* 1回の量（先頭に配置：perServingモードの換算に必要） */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">1回の量（g）</label>
            <input
              type="number"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="w-28 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* 栄養素 + 入力モード切替 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">栄養素</label>
              {/* モード切替トグル */}
              <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
                {(["per100g", "perServing"] as NutrientMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`px-2.5 py-1 transition-colors ${
                      mode === m
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
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
                  <input
                    type="number"
                    value={display}
                    onChange={(e) => handleNutrientChange(field, e.target.value)}
                    placeholder="—"
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1.5">入力単位: {modeLabel}</p>
          </div>

          {/* ランク */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">ランク</label>
            <div className="grid grid-cols-2 gap-2">
              {RANK_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRank(opt.value)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors text-left ${
                    rank === opt.value
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">メモ（任意）</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例: 1切れ約15g"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex-none px-4 py-4 border-t border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
          >
            {saving ? "保存中..." : "保存する"}
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

function MenuItemRow({
  item,
  entry,
  onAdd,
  onRemove,
  onChangeGrams,
  onEdit,
}: {
  item: MenuItem;
  entry: CartEntry | undefined;
  onAdd: () => void;
  onRemove: () => void;
  onChangeGrams: (g: number) => void;
  onEdit: () => void;
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

      {/* 名前 + PFC（タップで編集ドロワー） */}
      <button
        className="flex-1 min-w-0 text-left"
        onClick={onEdit}
      >
        <p className="text-sm text-white truncate">{item.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.protein_per_100g !== null
            ? `P${fmt(serving.p)} F${fmt(serving.f)} C${fmt(serving.c)}`
            : "PFC未設定 — タップして編集"}
        </p>
      </button>

      {/* グラム（タップで編集） */}
      <div className="shrink-0">
        {editingGrams ? (
          <input
            ref={inputRef}
            type="number"
            value={gramsInput}
            onChange={(e) => setGramsInput(e.target.value)}
            onBlur={commitGramsEdit}
            onKeyDown={(e) => e.key === "Enter" && commitGramsEdit()}
            className="w-14 text-center text-sm bg-gray-800 border border-emerald-500 rounded px-1 py-0.5 text-white"
          />
        ) : (
          <button
            onClick={startGramsEdit}
            className="text-xs text-gray-400 hover:text-white transition-colors px-1 py-1"
          >
            {displayGrams}g
          </button>
        )}
      </div>

      {/* カウント */}
      {count === 0 ? (
        <button
          onClick={onAdd}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-bold shrink-0"
        >
          +
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white"
          >
            −
          </button>
          <span className="w-5 text-center text-sm font-bold text-emerald-400 tabular-nums">
            {count}
          </span>
          <button
            onClick={onAdd}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            +
          </button>
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
  restaurants,
  menuItems: initialMenuItems,
  settings,
  todayConsumed,
  today,
}: Props) {
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initialMenuItems);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(
    restaurants[0]?.id ?? ""
  );
  const [cart, setCart] = useState<Map<string, CartEntry>>(new Map());
  const [mealType, setMealType] = useState<MealType>(getCurrentMealType());
  const [showRank3, setShowRank3] = useState(false);
  const [showRank4, setShowRank4] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(true);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

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

  const cartEntries = useMemo(
    () => Array.from(cart.values()).filter((e) => e.count > 0),
    [cart]
  );
  const hasCart = cartEntries.length > 0;

  // ── メニュー表示 ────────────────────────────────────────────────────────────
  const visibleItems = useMemo(() => {
    return menuItems
      .filter((item) => item.restaurant_id === selectedRestaurantId)
      .sort((a, b) =>
        a.rank !== b.rank ? a.rank - b.rank : b.order_count - a.order_count
      );
  }, [menuItems, selectedRestaurantId]);

  const rank1and2 = visibleItems.filter((i) => i.rank <= 2);
  const rank3 = visibleItems.filter((i) => i.rank === 3);
  const rank4 = visibleItems.filter((i) => i.rank === 4);

  // ── カート操作 ──────────────────────────────────────────────────────────────
  function addItem(item: MenuItem) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing) {
        next.set(item.id, { ...existing, count: existing.count + 1 });
      } else {
        next.set(item.id, { item, count: 1, gramsPerServing: item.default_grams });
      }
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

  // ── メニューアイテム更新 ────────────────────────────────────────────────────
  function handleItemSaved(updated: MenuItem) {
    setMenuItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    // カートにあれば item も更新
    setCart((prev) => {
      const entry = prev.get(updated.id);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(updated.id, {
        ...entry,
        item: updated,
        gramsPerServing: updated.default_grams,
      });
      return next;
    });
  }

  // ── 保存 ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!hasCart || saving) return;
    setSaving(true);
    const items = cartEntries.map((entry) => {
      const totalGrams = entry.gramsPerServing * entry.count;
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
    });
    const { error } = await saveMealToLog(items, mealType, today);
    if (error) {
      alert(`保存に失敗しました: ${error}`);
      setSaving(false);
      return;
    }
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
          <PFCBar label="F" current={totalPFC.f} target={settings.fat_target_g} color="bg-yellow-500" />
          <PFCBar label="C" current={totalPFC.c} target={settings.carbs_target_g} color="bg-emerald-500" />
        </div>

        {/* 食事タイプ タブ */}
        <div className="flex-none flex border-b border-gray-800">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((type) => (
            <button
              key={type}
              onClick={() => setMealType(type)}
              className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                mealType === type
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {MEAL_LABELS[type]}
            </button>
          ))}
        </div>

        {/* レストラン タブ */}
        <div className="flex-none flex border-b border-gray-800 overflow-x-auto">
          {restaurants.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRestaurantId(r.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                selectedRestaurantId === r.id
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>

        {/* メニューリスト */}
        <div className="flex-1 overflow-y-auto">
          {rank1and2.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              entry={cart.get(item.id)}
              onAdd={() => addItem(item)}
              onRemove={() => removeItem(item.id)}
              onChangeGrams={(g) => updateGrams(item.id, g)}
              onEdit={() => setEditingItem(item)}
            />
          ))}

          {rank3.length > 0 && (
            <>
              <button
                onClick={() => setShowRank3((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-amber-400 text-xs bg-gray-900/50 border-b border-gray-800/60"
              >
                <span>△ 控えめ（{rank3.length}品）</span>
                <span>{showRank3 ? "▲" : "▼"}</span>
              </button>
              {showRank3 &&
                rank3.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    entry={cart.get(item.id)}
                    onAdd={() => addItem(item)}
                    onRemove={() => removeItem(item.id)}
                    onChangeGrams={(g) => updateGrams(item.id, g)}
                    onEdit={() => setEditingItem(item)}
                  />
                ))}
            </>
          )}

          {rank4.length > 0 && (
            <>
              <button
                onClick={() => setShowRank4((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-red-400 text-xs bg-gray-900/50 border-b border-gray-800/60"
              >
                <span>✕ 避ける（{rank4.length}品）</span>
                <span>{showRank4 ? "▲" : "▼"}</span>
              </button>
              {showRank4 &&
                rank4.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    entry={cart.get(item.id)}
                    onAdd={() => addItem(item)}
                    onRemove={() => removeItem(item.id)}
                    onChangeGrams={(g) => updateGrams(item.id, g)}
                    onEdit={() => setEditingItem(item)}
                  />
                ))}
            </>
          )}

          {visibleItems.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-16">
              メニューがありません
            </p>
          )}
        </div>

        {/* カートパネル */}
        {hasCart && (
          <div className="flex-none border-t border-gray-700 bg-gray-900">
            <button
              onClick={() => setCartExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-sm font-medium text-white">
                カート（{cartEntries.length}品）
              </span>
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
                      <div
                        key={entry.item.id}
                        className="flex items-center justify-between px-4 py-1.5 border-b border-gray-800/50"
                      >
                        <span className="text-sm text-gray-200 truncate flex-1">
                          {entry.item.name}
                          <span className="text-gray-500 ml-1 text-xs">
                            ×{entry.count}（{totalGrams}g）
                          </span>
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
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                  >
                    {saving ? "記録中..." : "記録する"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 編集ドロワー */}
      {editingItem && (
        <EditDrawer
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={(updated) => {
            handleItemSaved(updated);
            setEditingItem(null);
          }}
        />
      )}
    </>
  );
}
