import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuPrefill } from "../lib/menu-prefill";
import { isSnapshotRestaurant, SNAPSHOT_RESTAURANT_NAME } from "../lib/snapshot-restaurant";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
};

type RestaurantRow = {
  id: string;
  name: string;
  order_count: number;
  created_at: string | null;
};

type MenuItemRow = {
  id: string;
  name: string;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  default_grams: number | null;
  rank: number;
  created_at: string | null;
};

/** `display_order` 列が無い DB でも動かすため、取得列のみで並べる（利用頻度 → 登録順）。 */
function sortRestaurants(list: RestaurantRow[]): RestaurantRow[] {
  return [...list].sort((a, b) => {
    if (b.order_count !== a.order_count) return b.order_count - a.order_count;
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    if (ac !== bc) return ac < bc ? -1 : 1;
    const nameCmp = a.name.localeCompare(b.name, "ja");
    if (nameCmp !== 0) return nameCmp;
    return a.id < b.id ? -1 : 1;
  });
}

/** Web `compareMenuItemsForListOrder` に揃える */
function compareMenuItemsForListOrder(a: MenuItemRow, b: MenuItemRow): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const nameCmp = a.name.localeCompare(b.name, "ja");
  if (nameCmp !== 0) return nameCmp;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

type Props = {
  visible: boolean;
  supabase: SupabaseClient;
  userId: string;
  onClose: () => void;
  onPick: (prefill: MenuPrefill) => void;
};

export function MenuPickModal({ visible, supabase, userId, onClose, onPick }: Props) {
  const [step, setStep] = useState<"restaurants" | "menus">("restaurants");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const resetLocal = useCallback(() => {
    setStep("restaurants");
    setRestaurantId(null);
    setRestaurantName("");
    setRestaurants([]);
    setMenuItems([]);
    setError(null);
    setQuery("");
  }, []);

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("restaurants")
      .select("id, name, order_count, created_at")
      .eq("user_id", userId);

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }

    const rows = (data ?? []) as RestaurantRow[];
    const filtered = sortRestaurants(rows.filter((r) => !isSnapshotRestaurant(r)));

    if (filtered.length === 0) {
      setRestaurants([]);
      return;
    }

    if (filtered.length === 1) {
      const only = filtered[0]!;
      setRestaurantId(only.id);
      setRestaurantName(only.name);
      setStep("menus");
      setLoading(true);
      const mRes = await supabase
        .from("menu_items")
        .select(
          "id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, rank, created_at"
        )
        .eq("user_id", userId)
        .eq("restaurant_id", only.id);
      setLoading(false);
      if (mRes.error) {
        setError(mRes.error.message);
        return;
      }
      const items = ((mRes.data ?? []) as MenuItemRow[]).sort(compareMenuItemsForListOrder);
      setMenuItems(items);
      return;
    }

    setRestaurants(filtered);
    setStep("restaurants");
  }, [supabase, userId]);

  const loadMenus = useCallback(
    async (rid: string, rname: string) => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("menu_items")
        .select(
          "id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, rank, created_at"
        )
        .eq("user_id", userId)
        .eq("restaurant_id", rid);

      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      setRestaurantId(rid);
      setRestaurantName(rname);
      setMenuItems(((data ?? []) as MenuItemRow[]).sort(compareMenuItemsForListOrder));
      setStep("menus");
      setQuery("");
    },
    [supabase, userId]
  );

  useEffect(() => {
    if (!visible) {
      resetLocal();
      return;
    }
    void loadRestaurants();
  }, [visible, loadRestaurants, resetLocal]);

  const filteredRestaurants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return restaurants;
    return restaurants.filter((r) => r.name.toLowerCase().includes(q));
  }, [restaurants, query]);

  const filteredMenus = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((m) => m.name.toLowerCase().includes(q));
  }, [menuItems, query]);

  const onSelectRestaurant = useCallback(
    (r: RestaurantRow) => {
      void loadMenus(r.id, r.name);
    },
    [loadMenus]
  );

  const onSelectMenu = useCallback(
    (m: MenuItemRow) => {
      if (!restaurantId) return;
      const defG = Number(m.default_grams);
      const defaultGrams = Number.isFinite(defG) && defG > 0 ? defG : 100;
      onPick({
        menuItemId: m.id,
        restaurantId,
        itemName: m.name,
        proteinPer100: m.protein_per_100g != null ? Number(m.protein_per_100g) : null,
        fatPer100: m.fat_per_100g != null ? Number(m.fat_per_100g) : null,
        carbsPer100: m.carbs_per_100g != null ? Number(m.carbs_per_100g) : null,
        defaultGrams,
      });
    },
    [restaurantId, onPick]
  );

  const goBackToRestaurants = useCallback(() => {
    setStep("restaurants");
    setRestaurantId(null);
    setRestaurantName("");
    setMenuItems([]);
    setQuery("");
    setError(null);
  }, []);

  const title =
    step === "restaurants"
      ? "店舗を選ぶ"
      : `メニュー（${restaurantName.length > 14 ? `${restaurantName.slice(0, 14)}…` : restaurantName}）`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            {step === "menus" && restaurants.length > 1 ? (
              <Pressable onPress={goBackToRestaurants} style={styles.backBtn} hitSlop={8}>
                <Text style={styles.backBtnText}>‹ 店舗</Text>
              </Pressable>
            ) : (
              <View style={styles.backPlaceholder} />
            )}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeBtnText}>閉じる</Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={step === "restaurants" ? "店名で絞り込み" : "メニュー名で絞り込み"}
            placeholderTextColor={COLORS.textMuted}
            style={styles.search}
            editable={!loading}
          />

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : step === "restaurants" ? (
            filteredRestaurants.length === 0 ? (
              <Text style={styles.hint}>
                登録済みの店舗がありません（「{SNAPSHOT_RESTAURANT_NAME}」は除く）。Web
                版で店舗とメニューを登録してからお試しください。
              </Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listPad}>
                {filteredRestaurants.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => onSelectRestaurant(r)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.rowText} numberOfLines={2}>
                      {r.name}
                    </Text>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )
          ) : filteredMenus.length === 0 ? (
            <Text style={styles.hint}>
              {menuItems.length === 0
                ? "この店舗にメニューがありません。Web 版から追加してください。"
                : "検索に一致するメニューがありません。"}
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listPad}>
              {filteredMenus.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => onSelectMenu(m)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.menuRowBody}>
                    <Text style={styles.rowText} numberOfLines={2}>
                      {m.name}
                    </Text>
                    <Text style={styles.menuMeta} numberOfLines={1}>
                      標準 {m.default_grams != null ? Number(m.default_grams) : 100}g · P/F/C
                      100g
                    </Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
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
    maxHeight: "85%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  backBtn: { minWidth: 56, paddingVertical: 4 },
  backBtnText: { color: "#93c5fd", fontSize: 15, fontWeight: "600" },
  backPlaceholder: { minWidth: 56 },
  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  closeBtn: { minWidth: 52, paddingVertical: 4 },
  closeBtnText: { color: COLORS.textMuted, fontSize: 14, textAlign: "right" },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 10,
  },
  center: { paddingVertical: 28, alignItems: "center" },
  error: { color: "#fecaca", fontSize: 13, marginBottom: 8 },
  hint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 8,
  },
  listPad: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuRowBody: { flex: 1, minWidth: 0 },
  rowText: { color: COLORS.text, fontSize: 15, fontWeight: "500" },
  menuMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  chev: { color: COLORS.textMuted, fontSize: 18, marginLeft: 8 },
});
