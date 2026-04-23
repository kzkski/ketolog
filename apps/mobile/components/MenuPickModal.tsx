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
import {
  addMenuItemToFavoritesMobile,
  removeMenuItemFromFavoritesMobile,
} from "../lib/favorite-mutations";
import type { FavoriteEntryPayload, FavoriteGroupPayload } from "../lib/fetch-favorite-groups-payload";
import {
  fetchFavoriteGroupsPayload,
  fetchFavoritedMenuItemIds,
} from "../lib/fetch-favorite-groups-payload";
import type { MenuPrefill } from "../lib/menu-prefill";
import { isSnapshotRestaurant, SNAPSHOT_RESTAURANT_NAME } from "../lib/snapshot-restaurant";

const COLORS = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  border: "#374151",
  primary: "#10b981",
  starOn: "#fbbf24",
};

type BrowseTab = "shops" | "favorites";

type RestaurantRow = {
  id: string;
  name: string;
  order_count: number;
  display_order?: number | null;
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

/** Web `sortRestaurants`（`useRestaurantState`）に揃える */
function sortRestaurants(list: RestaurantRow[]): RestaurantRow[] {
  return [...list].sort((a, b) => {
    const ao = a.display_order ?? 0;
    const bo = b.display_order ?? 0;
    if (ao !== bo) return ao - bo;
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
  const [browseTab, setBrowseTab] = useState<BrowseTab>("shops");
  const [step, setStep] = useState<"restaurants" | "menus">("restaurants");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [favoritedMenuItemIds, setFavoritedMenuItemIds] = useState<Set<string>>(new Set());
  const [favoriteGroups, setFavoriteGroups] = useState<FavoriteGroupPayload[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [favoriteToggleBusyId, setFavoriteToggleBusyId] = useState<string | null>(null);

  const resetLocal = useCallback(() => {
    setBrowseTab("shops");
    setStep("restaurants");
    setRestaurantId(null);
    setRestaurantName("");
    setRestaurants([]);
    setMenuItems([]);
    setError(null);
    setQuery("");
    setFavoriteGroups([]);
    setFavoritesError(null);
    setFavoritedMenuItemIds(new Set());
    setFavoriteToggleBusyId(null);
  }, []);

  const refreshFavoritedIds = useCallback(async () => {
    const r = await fetchFavoritedMenuItemIds(supabase, userId);
    if (!r.error) setFavoritedMenuItemIds(r.data);
  }, [supabase, userId]);

  const loadFavoriteGroups = useCallback(async () => {
    setFavoritesLoading(true);
    setFavoritesError(null);
    const r = await fetchFavoriteGroupsPayload(supabase, userId);
    setFavoritesLoading(false);
    if (r.error) {
      setFavoritesError(r.error);
      setFavoriteGroups([]);
      return;
    }
    setFavoriteGroups(r.data);
    await refreshFavoritedIds();
  }, [supabase, userId, refreshFavoritedIds]);

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("restaurants")
      .select("id, name, order_count, display_order, created_at")
      .eq("user_id", userId);

    if (err) {
      setLoading(false);
      setError(err.message);
      await refreshFavoritedIds();
      return;
    }

    const rows = (data ?? []) as RestaurantRow[];
    const filtered = sortRestaurants(rows.filter((r) => !isSnapshotRestaurant(r)));

    if (filtered.length === 0) {
      setRestaurants([]);
      setLoading(false);
      await refreshFavoritedIds();
      return;
    }

    if (filtered.length === 1) {
      const only = filtered[0]!;
      setRestaurantId(only.id);
      setRestaurantName(only.name);
      setStep("menus");
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
        await refreshFavoritedIds();
        return;
      }
      const items = ((mRes.data ?? []) as MenuItemRow[]).sort(compareMenuItemsForListOrder);
      setMenuItems(items);
      await refreshFavoritedIds();
      return;
    }

    setRestaurants(filtered);
    setStep("restaurants");
    setLoading(false);
    await refreshFavoritedIds();
  }, [supabase, userId, refreshFavoritedIds]);

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
        await refreshFavoritedIds();
        return;
      }
      setRestaurantId(rid);
      setRestaurantName(rname);
      setMenuItems(((data ?? []) as MenuItemRow[]).sort(compareMenuItemsForListOrder));
      setStep("menus");
      setQuery("");
      await refreshFavoritedIds();
    },
    [supabase, userId, refreshFavoritedIds]
  );

  useEffect(() => {
    if (!visible) {
      resetLocal();
      return;
    }
    void loadRestaurants();
  }, [visible, loadRestaurants, resetLocal]);

  useEffect(() => {
    if (!visible || browseTab !== "favorites") return;
    void loadFavoriteGroups();
  }, [visible, browseTab, loadFavoriteGroups]);

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

  const filteredFavoriteRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { groupName: string; entry: FavoriteEntryPayload }[] = [];
    for (const g of favoriteGroups) {
      for (const e of g.entries) {
        const mi = e.menu_item;
        if (!mi) continue;
        if (q && !mi.name.toLowerCase().includes(q)) continue;
        out.push({ groupName: g.name, entry: e });
      }
    }
    return out;
  }, [favoriteGroups, query]);

  const pickFromMenuItemRow = useCallback(
    (m: MenuItemRow, rid: string) => {
      const defG = Number(m.default_grams);
      const defaultGrams = Number.isFinite(defG) && defG > 0 ? defG : 100;
      onPick({
        menuItemId: m.id,
        restaurantId: rid,
        itemName: m.name,
        proteinPer100: m.protein_per_100g != null ? Number(m.protein_per_100g) : null,
        fatPer100: m.fat_per_100g != null ? Number(m.fat_per_100g) : null,
        carbsPer100: m.carbs_per_100g != null ? Number(m.carbs_per_100g) : null,
        defaultGrams,
      });
    },
    [onPick]
  );

  const onSelectRestaurant = useCallback(
    (r: RestaurantRow) => {
      void loadMenus(r.id, r.name);
    },
    [loadMenus]
  );

  const onSelectMenu = useCallback(
    (m: MenuItemRow) => {
      if (!restaurantId) return;
      pickFromMenuItemRow(m, restaurantId);
    },
    [restaurantId, pickFromMenuItemRow]
  );

  const onSelectFavoriteEntry = useCallback(
    (e: FavoriteEntryPayload) => {
      const mi = e.menu_item;
      if (!mi) return;
      pickFromMenuItemRow(mi as MenuItemRow, mi.restaurant_id);
    },
    [pickFromMenuItemRow]
  );

  const toggleFavoriteForMenu = useCallback(
    async (m: MenuItemRow) => {
      setError(null);
      setFavoriteToggleBusyId(m.id);
      try {
        if (favoritedMenuItemIds.has(m.id)) {
          const r = await removeMenuItemFromFavoritesMobile(supabase, m.id);
          if (r.error) {
            setError(r.error);
            return;
          }
        } else {
          const r = await addMenuItemToFavoritesMobile(supabase, userId, m.id);
          if (r.error) {
            setError(r.error);
            return;
          }
        }
        await refreshFavoritedIds();
        if (browseTab === "favorites") await loadFavoriteGroups();
      } finally {
        setFavoriteToggleBusyId(null);
      }
    },
    [
      supabase,
      userId,
      favoritedMenuItemIds,
      refreshFavoritedIds,
      browseTab,
      loadFavoriteGroups,
    ]
  );

  const goBackToRestaurants = useCallback(() => {
    setStep("restaurants");
    setRestaurantId(null);
    setRestaurantName("");
    setMenuItems([]);
    setQuery("");
    setError(null);
  }, []);

  const switchBrowseTab = useCallback(
    (t: BrowseTab) => {
      setBrowseTab(t);
      setQuery("");
      setError(null);
    },
    []
  );

  const title =
    browseTab === "favorites"
      ? "お気に入り"
      : step === "restaurants"
        ? "店舗を選ぶ"
        : `メニュー（${restaurantName.length > 14 ? `${restaurantName.slice(0, 14)}…` : restaurantName}）`;

  const showShopsContent = browseTab === "shops";
  const shopsBodyLoading = showShopsContent && loading;
  const favoritesBodyLoading = browseTab === "favorites" && favoritesLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            {showShopsContent && step === "menus" && restaurants.length > 1 ? (
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

          <View style={styles.tabRow}>
            <Pressable
              onPress={() => switchBrowseTab("shops")}
              style={({ pressed }) => [
                styles.tabBtn,
                browseTab === "shops" ? styles.tabBtnOn : styles.tabBtnOff,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={browseTab === "shops" ? styles.tabBtnTextOn : styles.tabBtnTextOff}>
                店舗から
              </Text>
            </Pressable>
            <Pressable
              onPress={() => switchBrowseTab("favorites")}
              style={({ pressed }) => [
                styles.tabBtn,
                browseTab === "favorites" ? styles.tabBtnOn : styles.tabBtnOff,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={browseTab === "favorites" ? styles.tabBtnTextOn : styles.tabBtnTextOff}>
                お気に入り
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              browseTab === "favorites"
                ? "メニュー名で絞り込み"
                : step === "restaurants"
                  ? "店名で絞り込み"
                  : "メニュー名で絞り込み"
            }
            placeholderTextColor={COLORS.textMuted}
            style={styles.search}
            editable={!shopsBodyLoading && !favoritesBodyLoading}
          />

          {shopsBodyLoading || favoritesBodyLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : browseTab === "favorites" ? (
            favoritesError ? (
              <Text style={styles.error}>{favoritesError}</Text>
            ) : filteredFavoriteRows.length === 0 ? (
              <Text style={styles.hint}>
                お気に入りはまだありません。Web 版の Today でメニューの ☆
                を押すとここに集約されます。店舗タブのメニュー一覧でも ☆ で追加できます。
              </Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listPad}>
                {filteredFavoriteRows.map(({ groupName, entry }) => {
                  const mi = entry.menu_item;
                  if (!mi) return null;
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => onSelectFavoriteEntry(entry)}
                      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                    >
                      <View style={styles.menuRowBody}>
                        <Text style={styles.favGroupHint} numberOfLines={1}>
                          {groupName}
                        </Text>
                        <Text style={styles.rowText} numberOfLines={2}>
                          {mi.name}
                        </Text>
                        <Text style={styles.menuMeta} numberOfLines={1}>
                          標準 {mi.default_grams != null ? Number(mi.default_grams) : 100}g · P/F/C
                          100g
                        </Text>
                      </View>
                      <Text style={styles.chev}>›</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )
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
                <View key={m.id} style={styles.row}>
                  <Pressable
                    onPress={() => onSelectMenu(m)}
                    style={({ pressed }) => [styles.menuRowPress, pressed && { opacity: 0.85 }]}
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
                  <Pressable
                    onPress={() => {
                      void toggleFavoriteForMenu(m);
                    }}
                    disabled={favoriteToggleBusyId !== null}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.starBtn,
                      pressed && { opacity: 0.75 },
                      favoriteToggleBusyId !== null && { opacity: 0.45 },
                    ]}
                    accessibilityLabel={
                      favoritedMenuItemIds.has(m.id) ? "お気に入りを解除" : "お気に入りに追加"
                    }
                  >
                    {favoriteToggleBusyId === m.id ? (
                      <ActivityIndicator size="small" color={COLORS.starOn} />
                    ) : (
                      <Text style={styles.starGlyph}>
                        {favoritedMenuItemIds.has(m.id) ? "★" : "☆"}
                      </Text>
                    )}
                  </Pressable>
                </View>
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
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnOn: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  tabBtnOff: {
    borderColor: COLORS.border,
    backgroundColor: "#0f172a",
  },
  tabBtnTextOn: { color: "#a7f3d0", fontSize: 14, fontWeight: "700" },
  tabBtnTextOff: { color: COLORS.textMuted, fontSize: 14, fontWeight: "600" },
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
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuRowPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingRight: 4,
    minWidth: 0,
  },
  menuRowBody: { flex: 1, minWidth: 0 },
  rowText: { color: COLORS.text, fontSize: 15, fontWeight: "500" },
  favGroupHint: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginBottom: 2,
    fontWeight: "600",
  },
  menuMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  chev: { color: COLORS.textMuted, fontSize: 18, marginLeft: 4 },
  starBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 44,
  },
  starGlyph: { fontSize: 20, color: COLORS.starOn },
});
