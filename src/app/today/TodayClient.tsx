"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MenuItem, Restaurant, UserSettings, TodayConsumed } from "@/types/database";
import { saveMealToLog } from "./actions";

// ─── 型 ────────────────────────────────────────────────────────────────────────

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

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

// ─── サブコンポーネント：PFCバー ────────────────────────────────────────────────

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

// ─── サブコンポーネント：メニューアイテム行 ─────────────────────────────────────

const RANK_ICON: Record<number, { icon: string; className: string }> = {
  1: { icon: "◎", className: "text-emerald-400" },
  2: { icon: "○", className: "text-gray-400" },
  3: { icon: "△", className: "text-amber-400" },
  4: { icon: "✕", className: "text-red-400" },
};

function MenuItemRow({
  item,
  entry,
  onAdd,
  onRemove,
  onChangeGrams,
}: {
  item: MenuItem;
  entry: CartEntry | undefined;
  onAdd: () => void;
  onRemove: () => void;
  onChangeGrams: (g: number) => void;
}) {
  const [editingGrams, setEditingGrams] = useState(false);
  const [gramsInput, setGramsInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayGrams = entry?.gramsPerServing ?? item.default_grams;
  const serving = pfc(item, displayGrams);
  const count = entry?.count ?? 0;
  const rank = RANK_ICON[item.rank] ?? RANK_ICON[2];

  function startEdit() {
    setGramsInput(displayGrams.toString());
    setEditingGrams(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const val = parseFloat(gramsInput);
    if (!isNaN(val) && val > 0) onChangeGrams(val);
    setEditingGrams(false);
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/60">
      {/* ランク + 名前 */}
      <span className={`text-xs shrink-0 ${rank.className}`}>{rank.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.protein_per_100g !== null
            ? `P${fmt(serving.p)} F${fmt(serving.f)} C${fmt(serving.c)}`
            : "PFC未設定"}
        </p>
      </div>

      {/* グラム（タップで編集） */}
      <div className="shrink-0">
        {editingGrams ? (
          <input
            ref={inputRef}
            type="number"
            value={gramsInput}
            onChange={(e) => setGramsInput(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === "Enter" && commitEdit()}
            className="w-14 text-center text-sm bg-gray-800 border border-emerald-500 rounded px-1 py-0.5 text-white"
          />
        ) : (
          <button
            onClick={startEdit}
            className="text-xs text-gray-400 hover:text-white transition-colors px-1"
          >
            {displayGrams}g
          </button>
        )}
      </div>

      {/* カウント操作 */}
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
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-base"
          >
            −
          </button>
          <span className="w-5 text-center text-sm font-bold text-emerald-400 tabular-nums">
            {count}
          </span>
          <button
            onClick={onAdd}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-base"
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
  menuItems,
  settings,
  todayConsumed,
  today,
}: Props) {
  const router = useRouter();
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(
    restaurants[0]?.id ?? ""
  );
  const [cart, setCart] = useState<Map<string, CartEntry>>(new Map());
  const [mealType, setMealType] = useState<MealType>(getCurrentMealType());
  const [showRank3, setShowRank3] = useState(false);
  const [showRank4, setShowRank4] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(true);

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

  // ── 表示メニュー ────────────────────────────────────────────────────────────
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
      if (existing.count <= 1) {
        next.delete(itemId);
      } else {
        next.set(itemId, { ...existing, count: existing.count - 1 });
      }
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
    <div className="flex-1 flex flex-col min-h-0">
      {/* PFCバー */}
      <div className="flex-none px-4 py-3 bg-gray-900 border-b border-gray-800 space-y-1.5">
        <PFCBar label="P" current={totalPFC.p} target={settings.protein_target_g} color="bg-blue-500" />
        <PFCBar label="F" current={totalPFC.f} target={settings.fat_target_g} color="bg-yellow-500" />
        <PFCBar label="C" current={totalPFC.c} target={settings.carbs_target_g} color="bg-emerald-500" />
      </div>

      {/* 食事タイプ */}
      <div className="flex-none flex gap-1 px-4 py-2 border-b border-gray-800">
        {(Object.keys(MEAL_LABELS) as MealType[]).map((type) => (
          <button
            key={type}
            onClick={() => setMealType(type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mealType === type
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {MEAL_LABELS[type]}
          </button>
        ))}
      </div>

      {/* レストランタブ */}
      <div className="flex-none flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-800 scrollbar-none">
        {restaurants.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedRestaurantId(r.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
              selectedRestaurantId === r.id
                ? "bg-white text-gray-900"
                : "bg-gray-800 text-gray-300 hover:text-white"
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
          />
        ))}

        {/* rank3 */}
        {rank3.length > 0 && (
          <>
            <button
              onClick={() => setShowRank3((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-amber-400 text-xs bg-gray-900/50"
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
                />
              ))}
          </>
        )}

        {/* rank4 */}
        {rank4.length > 0 && (
          <>
            <button
              onClick={() => setShowRank4((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-red-400 text-xs bg-gray-900/50"
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
                />
              ))}
          </>
        )}

        {/* 空状態 */}
        {visibleItems.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-16">
            メニューがありません
          </p>
        )}
      </div>

      {/* カートパネル */}
      {hasCart && (
        <div className="flex-none border-t border-gray-700 bg-gray-900">
          {/* ヘッダー（折りたたみ） */}
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
              {/* カートアイテム一覧 */}
              <div className="max-h-40 overflow-y-auto border-t border-gray-800">
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
                          ×{entry.count} ({totalGrams}g)
                        </span>
                      </span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2 tabular-nums">
                        P{fmt(v.p)} F{fmt(v.f)} C{fmt(v.c)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 合計 + 保存ボタン */}
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
  );
}
