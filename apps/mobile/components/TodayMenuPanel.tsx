import { Ionicons } from "@expo/vector-icons";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { pfcGramsFromNullablePer100 } from "@ketolog/domain/pfc";
import { buildRestaurantExportDocument } from "@ketolog/domain/restaurant-json-v1";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type DragEndParams,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addMenuItemToFavoritesMobile,
  removeMenuItemFromFavoritesMobile,
} from "../lib/favorite-mutations";
import type {
  FavoriteGroupPayload,
  FavoriteMenuItemPayload,
} from "../lib/fetch-favorite-groups-payload";
import {
  fetchFavoriteGroupsPayload,
  fetchFavoritedMenuItemIds,
} from "../lib/fetch-favorite-groups-payload";
import { isSnapshotRestaurant } from "../lib/snapshot-restaurant";
import {
  MENU_GROUP_FAVORITES_SCOPE,
  collapsedMenuGroupsFromExpandedKeys,
  readMenuGroupExpandedKeysNative,
  writeMenuGroupExpandedKeysNative,
} from "../lib/menu-group-expanded-storage-native";
import {
  menuRowMacroHighlights,
  type MacroHighlightTargets,
} from "../lib/menu-row-macro-highlights";
import type { StandardFoodSearchRow } from "../lib/search-standard-foods-mobile";
import { RenameRestaurantModal } from "./RenameRestaurantModal";
import { StandardFoodCompositionPanel } from "./StandardFoodCompositionPanel";
import { ImportMenuItemsModal } from "./ImportMenuItemsModal";
import { deleteRestaurantMobile } from "../lib/delete-restaurant-mobile";
import { reorderRestaurantsMobile } from "../lib/reorder-restaurants-mobile";
import { shareUtf8JsonFile } from "../lib/share-json-mobile";

type BrowseTab = "favorites" | "shops" | "composition";

/** Web `MenuGroup` に相当 */
type MenuGroup = {
  sectionKey: string;
  groupName: string | null;
  groupOrder: number;
  items: FavoriteMenuItemPayload[];
};

function normalizeMenuGroupKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t === "" ? null : t;
}

type RestaurantRow = {
  id: string;
  name: string;
  /** 旧行に無い場合は `loadRestaurants` 側で `other` を補う */
  category: string;
  order_count: number;
  display_order?: number | null;
  created_at: string | null;
};

type MenuItemRow = FavoriteMenuItemPayload;

function sortRestaurants(list: RestaurantRow[]): RestaurantRow[] {
  return [...list].sort((a, b) => {
    const ao = a.display_order ?? 0;
    const bo = b.display_order ?? 0;
    if (ao !== bo) return ao - bo;
    if (b.order_count !== a.order_count) return b.order_count - a.order_count;
    return a.name.localeCompare(b.name, "ja");
  });
}

function buildShopMenuGroups(items: FavoriteMenuItemPayload[]): MenuGroup[] {
  const sorted = sortMenusForListOrder([...items]);
  const groupMap = new Map<string | null, MenuGroup>();
  for (const item of sorted) {
    const key = normalizeMenuGroupKey(item.group_name);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        sectionKey: key === null ? "ungrouped" : `g:${key}`,
        groupName: key,
        groupOrder: Number(item.group_order) || 0,
        items: [],
      });
    }
    groupMap.get(key)!.items.push(item);
  }
  return [...groupMap.values()].sort((a, b) => {
    if (a.groupName === null) return -1;
    if (b.groupName === null) return 1;
    const o = a.groupOrder - b.groupOrder;
    if (o !== 0) return o;
    return (a.groupName as string).localeCompare(b.groupName as string, "ja");
  });
}

function buildFavoriteMenuGroups(
  groups: FavoriteGroupPayload[],
  query: string
): MenuGroup[] {
  const q = query.trim().toLowerCase();
  return groups
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((g) => {
      const items: FavoriteMenuItemPayload[] = [];
      for (const e of [...g.entries].sort((x, y) => x.display_order - y.display_order)) {
        const mi = e.menu_item;
        if (!mi) continue;
        if (q && !mi.name.toLowerCase().includes(q)) continue;
        items.push(mi);
      }
      return {
        sectionKey: `favg:${g.id}`,
        groupName: g.name,
        groupOrder: g.display_order,
        items,
      };
    })
    .filter((x) => x.items.length > 0);
}

type Props = {
  supabase: SupabaseClient;
  userId: string;
  /** 引き下げ更新などでデータを取り直す */
  reloadNonce?: number;
  onAddToCart: (item: FavoriteMenuItemPayload, gramsPerServing: number) => void;
  onEditMenuItem?: (item: FavoriteMenuItemPayload) => void;
  /** 店舗タブ行の「＋」（Web `RestaurantPanel` のお店追加） */
  onOpenRestaurantAdd?: () => void;
  /** 一覧下の「＋ メニューを追加」（Web `MenuItemList`）。いま選んでいる店を登録先ヒントにする */
  onOpenMenuEditorAdd?: (registerRestaurantIdHint: string | null) => void;
  /** 店舗追加直後にこの店タブへ切り替える */
  selectRestaurantIdAfterAdd?: string | null;
  onSelectRestaurantIdAfterAddConsumed?: () => void;
  /** メニュー行の P/F 強調（Web `MenuItemRow` の `pfcTargets`） */
  macroTargets: MacroHighlightTargets;
  /** Web の `browseTabRequest` 相当: 成分表タブへ切り替え */
  browseTabRequest?: "composition" | null;
  onBrowseTabRequestConsumed?: () => void;
  /** 文科省検索からメニュー追加モーダルを開く（登録先ヒントは null 可） */
  onPickStandardFoodForMenu?: (row: StandardFoodSearchRow, registerRestaurantIdHint: string | null) => void;
  onToast?: (message: string) => void;
  /** 店舗削除後（カートの該当行除去など） */
  onRestaurantDeleted?: (restaurantId: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  menuBottomInset?: number;
};

/** Web `compareMenuItemsForListOrder` / `sortMenuItemsForListOrder` と同順 */
function compareMenuItemsForListOrder(a: MenuItemRow, b: MenuItemRow): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const nameCmp = a.name.localeCompare(b.name, "ja");
  if (nameCmp !== 0) return nameCmp;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sortMenusForListOrder(list: MenuItemRow[]): MenuItemRow[] {
  return [...list].sort(compareMenuItemsForListOrder);
}

const RANK_CELL: Record<number, { icon: string; color: string }> = {
  1: { icon: "◎", color: "#34d399" },
  2: { icon: "○", color: "#6b7280" },
  3: { icon: "△", color: "#fbbf24" },
  4: { icon: "✕", color: "#f87171" },
};

function fmtPfc(n: number) {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

function MenuLineRow({
  item,
  starred,
  onToggleStar,
  onAdd,
  onEdit,
  macroTargets,
}: {
  item: MenuItemRow;
  starred: boolean;
  onToggleStar: () => void;
  onAdd: (grams: number) => void;
  onEdit?: () => void;
  macroTargets: MacroHighlightTargets;
}) {
  const defaultG = item.default_grams && item.default_grams > 0 ? Number(item.default_grams) : 100;
  const [grams, setGrams] = useState(defaultG);
  const [editing, setEditing] = useState(false);
  const [gramsStr, setGramsStr] = useState(String(defaultG));

  useEffect(() => {
    const d = item.default_grams && item.default_grams > 0 ? Number(item.default_grams) : 100;
    setGrams(d);
    setGramsStr(String(d));
    setEditing(false);
  }, [item.id, item.default_grams]);

  const serving = pfcGramsFromNullablePer100(
    item.protein_per_100g != null ? Number(item.protein_per_100g) : null,
    item.fat_per_100g != null ? Number(item.fat_per_100g) : null,
    item.carbs_per_100g != null ? Number(item.carbs_per_100g) : null,
    grams
  );
  const rankCell = RANK_CELL[item.rank] ?? RANK_CELL[2]!;
  const { highlightP, highlightF } =
    item.protein_per_100g != null
      ? menuRowMacroHighlights(
          { p: serving.p, f: serving.f },
          {
            protein_per_100g: item.protein_per_100g != null ? Number(item.protein_per_100g) : null,
            fat_per_100g: item.fat_per_100g != null ? Number(item.fat_per_100g) : null,
          },
          macroTargets
        )
      : { highlightP: false, highlightF: false };

  return (
    <View style={styles.row}>
      <Pressable onPress={onToggleStar} style={styles.starBtn} hitSlop={6}>
        <Text style={[styles.star, starred && styles.starOn]}>{starred ? "★" : "☆"}</Text>
      </Pressable>
      <View style={styles.rankCol}>
        <Text style={[styles.rankText, { color: rankCell.color }]}>{rankCell.icon}</Text>
      </View>
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [styles.rowBody, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}を編集`}
        >
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.rowPfc}>
            {item.protein_per_100g != null ? (
              <>
                <Text style={highlightP ? styles.pfcPHi : styles.pfcMuted}>P{fmtPfc(serving.p)}</Text>
                <Text style={styles.pfcMuted}> </Text>
                <Text style={highlightF ? styles.pfcFHi : styles.pfcMuted}>F{fmtPfc(serving.f)}</Text>
                <Text style={styles.pfcMuted}> </Text>
                <Text style={styles.pfcMuted}>C{fmtPfc(serving.c)}</Text>
              </>
            ) : (
              <Text style={styles.rowPfcUnset}>PFC未設定 — タップして編集</Text>
            )}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.rowPfc}>
            {item.protein_per_100g != null ? (
              <>
                <Text style={highlightP ? styles.pfcPHi : styles.pfcMuted}>P{fmtPfc(serving.p)}</Text>
                <Text style={styles.pfcMuted}> </Text>
                <Text style={highlightF ? styles.pfcFHi : styles.pfcMuted}>F{fmtPfc(serving.f)}</Text>
                <Text style={styles.pfcMuted}> </Text>
                <Text style={styles.pfcMuted}>C{fmtPfc(serving.c)}</Text>
              </>
            ) : (
              <Text style={styles.rowPfcUnset}>PFC未設定</Text>
            )}
          </Text>
        </View>
      )}
      {editing ? (
        <TextInput
          value={gramsStr}
          onChangeText={setGramsStr}
          onBlur={() => {
            const n = Number.parseFloat(gramsStr.replace(/,/g, ""));
            if (Number.isFinite(n) && n > 0) {
              setGrams(n);
              setGramsStr(String(n));
            } else {
              setGramsStr(String(grams));
            }
            setEditing(false);
          }}
          keyboardType="decimal-pad"
          style={styles.gramsInput}
          autoFocus
        />
      ) : (
        <Pressable onPress={() => setEditing(true)} style={styles.gramsTap}>
          <Text style={styles.gramsTapText}>{grams}g</Text>
        </Pressable>
      )}
      <Pressable onPress={() => onAdd(grams)} style={styles.plusBtn}>
        <Text style={styles.plusBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function TodayMenuPanel({
  supabase,
  userId,
  reloadNonce = 0,
  onAddToCart,
  onEditMenuItem,
  onOpenRestaurantAdd,
  onOpenMenuEditorAdd,
  selectRestaurantIdAfterAdd,
  onSelectRestaurantIdAfterAddConsumed,
  macroTargets,
  browseTabRequest,
  onBrowseTabRequestConsumed,
  onPickStandardFoodForMenu,
  onToast,
  onRestaurantDeleted,
  refreshing = false,
  onRefresh,
  menuBottomInset = 24,
}: Props) {
  const [tab, setTab] = useState<BrowseTab>("favorites");
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [favoriteGroups, setFavoriteGroups] = useState<FavoriteGroupPayload[]>([]);
  const [favoritedMenuItemIds, setFavoritedMenuItemIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  /** 成分表タブ用（店舗メニュー検索の `query` と分離） */
  const [compositionQuery, setCompositionQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameRestaurantTarget, setRenameRestaurantTarget] = useState<RestaurantRow | null>(null);
  const [confirmDeleteRestaurant, setConfirmDeleteRestaurant] = useState(false);
  const [deletingRestaurant, setDeletingRestaurant] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);

  const refreshFavoritedIds = useCallback(async () => {
    const r = await fetchFavoritedMenuItemIds(supabase, userId);
    if (!r.error) setFavoritedMenuItemIds(r.data);
  }, [supabase, userId]);

  const loadFavorites = useCallback(async () => {
    const r = await fetchFavoriteGroupsPayload(supabase, userId);
    if (r.error) {
      setError(r.error);
      setFavoriteGroups([]);
      return;
    }
    setFavoriteGroups(r.data);
  }, [supabase, userId]);

  const loadRestaurants = useCallback(async () => {
    let data: unknown[] | null = null;
    const primary = await supabase
      .from("restaurants")
      .select("id, name, category, order_count, display_order, created_at")
      .eq("user_id", userId);
    if (primary.error) {
      const missingDisplayOrder =
        primary.error.message.toLowerCase().includes("display_order") &&
        primary.error.message.toLowerCase().includes("does not exist");
      if (!missingDisplayOrder) {
        setError(primary.error.message);
        setRestaurants([]);
        return;
      }
      const fallback = await supabase
        .from("restaurants")
        .select("id, name, category, order_count, created_at")
        .eq("user_id", userId);
      if (fallback.error) {
        setError(fallback.error.message);
        setRestaurants([]);
        return;
      }
      data = fallback.data as unknown[] | null;
    } else {
      data = primary.data as unknown[] | null;
    }
    const rows = sortRestaurants(
      ((data ?? []) as Record<string, unknown>[])
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          category:
            typeof r.category === "string" && r.category.trim() !== "" ? r.category : "other",
          order_count: Number(r.order_count) || 0,
          display_order: r.display_order != null ? Number(r.display_order) : undefined,
          created_at: r.created_at != null ? String(r.created_at) : null,
        }))
        .filter((r) => !isSnapshotRestaurant(r))
    );
    setRestaurants(rows);
    setSelectedRestaurantId((prev) =>
      prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null
    );
  }, [supabase, userId]);

  const openRestaurantTabMenu = useCallback((r: RestaurantRow) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["キャンセル", "名前を変更"], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) setRenameRestaurantTarget(r);
        }
      );
    } else {
      Alert.alert(r.name, undefined, [
        { text: "キャンセル", style: "cancel" },
        { text: "名前を変更", onPress: () => setRenameRestaurantTarget(r) },
      ]);
    }
  }, []);

  const handleRestaurantRenamed = useCallback(
    (nextName: string, updatedFavoriteGroupId: string | null, restaurantId: string) => {
      setRestaurants((prev) =>
        sortRestaurants(
          prev.map((row) => (row.id === restaurantId ? { ...row, name: nextName } : row))
        )
      );
      if (updatedFavoriteGroupId) {
        void loadFavorites();
      }
    },
    [loadFavorites]
  );

  const handleRestaurantDragEnd = useCallback(
    ({ data }: DragEndParams<RestaurantRow>) => {
      const next = data.map((r, index) => ({ ...r, display_order: index }));
      setRestaurants(next);
      void (async () => {
        const { error } = await reorderRestaurantsMobile(
          supabase,
          userId,
          next.map((r) => r.id)
        );
        if (error) {
          setError(error);
          await loadRestaurants();
        }
      })();
    },
    [supabase, userId, loadRestaurants]
  );

  const renderRestaurantDraggableItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<RestaurantRow>) => {
      const selected = tab === "shops" && selectedRestaurantId === item.id;
      return (
        <ScaleDecorator>
          <View
            style={[
              styles.restaurantTabStrip,
              selected ? styles.restaurantTabStripOn : null,
              isActive ? styles.restaurantTabStripDragging : null,
            ]}
          >
            <Pressable
              onLongPress={drag}
              delayLongPress={220}
              disabled={isActive}
              style={({ pressed }) => [
                styles.restaurantDragHandle,
                (pressed || isActive) && { opacity: 0.78 },
              ]}
              accessibilityLabel={`${item.name}の表示順を変更`}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            >
              <Text style={styles.restaurantDragHandleGlyph}>⣿</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setTab("shops");
                setSelectedRestaurantId(item.id);
              }}
              onLongPress={() => openRestaurantTabMenu(item)}
              delayLongPress={520}
              disabled={isActive}
              style={({ pressed }) => [styles.restaurantNameHit, pressed && { opacity: 0.88 }]}
              accessibilityLabel={item.name}
              accessibilityHint="長押しで名前を変更"
            >
              <Text
                style={[
                  styles.restaurantNameText,
                  selected ? styles.restaurantNameTextOn : null,
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </Pressable>
          </View>
        </ScaleDecorator>
      );
    },
    [tab, selectedRestaurantId, openRestaurantTabMenu]
  );

  const loadMenus = useCallback(async () => {
    if (!selectedRestaurantId) {
      setMenuItems([]);
      return;
    }
    const { data, error: err } = await supabase
      .from("menu_items")
      .select(
        "id, restaurant_id, name, protein_per_100g, fat_per_100g, carbs_per_100g, default_grams, order_count, rank, notes, group_name, group_order, shared_barcode, standard_food_code, created_at"
      )
      .eq("user_id", userId)
      .eq("restaurant_id", selectedRestaurantId);
    if (err) {
      setError(err.message);
      setMenuItems([]);
      return;
    }
    setMenuItems(sortMenusForListOrder((data ?? []) as MenuItemRow[]));
  }, [selectedRestaurantId, supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      await Promise.all([loadFavorites(), loadRestaurants(), refreshFavoritedIds()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadNonce, loadFavorites, loadRestaurants, refreshFavoritedIds]);

  useEffect(() => {
    void loadMenus();
  }, [loadMenus]);

  useEffect(() => {
    if (!selectRestaurantIdAfterAdd) return;
    if (!restaurants.some((r) => r.id === selectRestaurantIdAfterAdd)) return;
    setTab("shops");
    setSelectedRestaurantId(selectRestaurantIdAfterAdd);
    onSelectRestaurantIdAfterAddConsumed?.();
  }, [restaurants, selectRestaurantIdAfterAdd, onSelectRestaurantIdAfterAddConsumed]);

  const visibleMenus = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((m) => m.name.toLowerCase().includes(q));
  }, [menuItems, query]);

  const menuGroups = useMemo((): MenuGroup[] => {
    if (tab === "composition") return [];
    if (tab === "favorites") {
      return buildFavoriteMenuGroups(favoriteGroups, query);
    }
    return buildShopMenuGroups(visibleMenus);
  }, [tab, favoriteGroups, query, visibleMenus]);

  useEffect(() => {
    if (!browseTabRequest) return;
    if (browseTabRequest === "composition") {
      setTab("composition");
    }
    onBrowseTabRequestConsumed?.();
  }, [browseTabRequest, onBrowseTabRequestConsumed]);

  const collapsibleSectionKeys = useMemo(
    () => menuGroups.filter((g) => g.groupName !== null).map((g) => g.sectionKey),
    [menuGroups]
  );

  const collapsibleJoined = useMemo(
    () => collapsibleSectionKeys.join("\0"),
    [collapsibleSectionKeys]
  );

  const storageScope = useMemo((): string | null => {
    if (tab === "composition") return null;
    if (tab === "favorites") return MENU_GROUP_FAVORITES_SCOPE;
    if (!selectedRestaurantId) return null;
    return selectedRestaurantId;
  }, [tab, selectedRestaurantId]);

  const [expandedGroupKeys, setExpandedGroupKeys] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setExpandedGroupKeys(null);
      if (!storageScope || collapsibleSectionKeys.length <= 1) {
        if (!cancelled) {
          setExpandedGroupKeys([...collapsibleSectionKeys]);
        }
        return;
      }
      const keys = await readMenuGroupExpandedKeysNative(storageScope);
      const filtered = keys.filter((k) => collapsibleSectionKeys.includes(k));
      if (!cancelled) setExpandedGroupKeys(filtered);
    })();
    return () => {
      cancelled = true;
    };
  }, [storageScope, collapsibleJoined, collapsibleSectionKeys.length]);

  const collapsedSet = useMemo(
    () =>
      collapsedMenuGroupsFromExpandedKeys(
        collapsibleSectionKeys,
        collapsibleSectionKeys.length <= 1 ? null : storageScope,
        expandedGroupKeys ?? collapsibleSectionKeys
      ),
    [collapsibleSectionKeys, storageScope, expandedGroupKeys]
  );

  const toggleMenuGroupCollapsed = useCallback(
    async (sectionKey: string) => {
      if (!storageScope || collapsibleSectionKeys.length <= 1) return;
      const base = expandedGroupKeys ?? collapsibleSectionKeys;
      const expandedSet = new Set(
        base.filter((k) => collapsibleSectionKeys.includes(k))
      );
      if (expandedSet.has(sectionKey)) expandedSet.delete(sectionKey);
      else expandedSet.add(sectionKey);
      const next = [...expandedSet];
      await writeMenuGroupExpandedKeysNative(storageScope, next);
      setExpandedGroupKeys(next);
    },
    [storageScope, collapsibleSectionKeys, expandedGroupKeys]
  );

  const toggleFavorite = useCallback(
    async (item: MenuItemRow) => {
      if (favoritedMenuItemIds.has(item.id)) {
        const r = await removeMenuItemFromFavoritesMobile(supabase, item.id);
        if (r.error) {
          setError(r.error);
          return;
        }
      } else {
        const r = await addMenuItemToFavoritesMobile(supabase, userId, item.id);
        if (r.error) {
          setError(r.error);
          return;
        }
      }
      await Promise.all([refreshFavoritedIds(), loadFavorites()]);
    },
    [favoritedMenuItemIds, supabase, userId, refreshFavoritedIds, loadFavorites]
  );

  const selectedShop = useMemo(() => {
    if (!selectedRestaurantId) return null;
    return restaurants.find((r) => r.id === selectedRestaurantId) ?? null;
  }, [restaurants, selectedRestaurantId]);

  useEffect(() => {
    setConfirmDeleteRestaurant(false);
  }, [selectedRestaurantId]);

  const handleDownloadRestaurantJson = useCallback(async () => {
    if (!selectedShop) return;
    const payload = buildRestaurantExportDocument(
      {
        id: selectedShop.id,
        name: selectedShop.name,
        category: selectedShop.category || "other",
      },
      menuItems.map((m) => ({
        restaurant_id: m.restaurant_id,
        name: m.name,
        protein_per_100g: m.protein_per_100g != null ? Number(m.protein_per_100g) : null,
        fat_per_100g: m.fat_per_100g != null ? Number(m.fat_per_100g) : null,
        carbs_per_100g: m.carbs_per_100g != null ? Number(m.carbs_per_100g) : null,
        shared_barcode: m.shared_barcode != null ? String(m.shared_barcode) : null,
        standard_food_code: m.standard_food_code != null ? String(m.standard_food_code) : null,
        default_grams: Number(m.default_grams) || 100,
        rank: Number(m.rank) || 2,
        notes: m.notes != null ? String(m.notes) : null,
        group_name: normalizeMenuGroupKey(m.group_name),
      }))
    );
    const date = new Date().toISOString().split("T")[0];
    const slug = selectedShop.name.replace(/\s+/g, "-");
    const fname = `ketolog-${slug}-${date}.json`;
    const share = await shareUtf8JsonFile(fname, JSON.stringify(payload, null, 2));
    if (share.error) {
      onToast?.(share.error);
      return;
    }
    onToast?.("共有シートから保存できます");
  }, [selectedShop, menuItems, onToast]);

  const handleDeleteRestaurant = useCallback(async () => {
    if (!selectedShop) return;
    setDeletingRestaurant(true);
    const res = await deleteRestaurantMobile(supabase, userId, selectedShop.id);
    if (res.error) {
      onToast?.(res.error);
      setDeletingRestaurant(false);
      return;
    }
    const rid = selectedShop.id;
    const next = restaurants.filter((r) => r.id !== rid);
    setRestaurants(next);
    setMenuItems((prev) => prev.filter((m) => m.restaurant_id !== rid));
    setSelectedRestaurantId(next[0]?.id ?? null);
    setConfirmDeleteRestaurant(false);
    setDeletingRestaurant(false);
    onRestaurantDeleted?.(rid);
    await Promise.all([loadFavorites(), refreshFavoritedIds()]);
  }, [
    selectedShop,
    supabase,
    userId,
    restaurants,
    onToast,
    onRestaurantDeleted,
    loadFavorites,
    refreshFavoritedIds,
  ]);

  return (
    <View style={styles.wrap}>
      <View style={styles.switchRow}>
        <View style={styles.leftModeTabs}>
          <Pressable
            onPress={() => setTab("favorites")}
            style={({ pressed }) => [
              styles.modeTab,
              tab === "favorites" && styles.modeTabOn,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="お気に入り"
          >
            <Text style={[styles.modeTabIcon, tab === "favorites" && styles.modeTabIconOn]}>
              {tab === "favorites" ? "★" : "☆"}
            </Text>
            <Text
              style={[styles.modeTabLabel, tab === "favorites" && styles.modeTabLabelOn]}
              numberOfLines={1}
            >
              お気に入り
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab("composition")}
            style={({ pressed }) => [
              styles.modeTab,
              tab === "composition" && styles.modeTabOn,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="食品成分表"
          >
            <View style={styles.modeTabGlyphWrap}>
              <Ionicons
                name="search"
                size={12}
                color={tab === "composition" ? "#34d399" : "#6b7280"}
              />
            </View>
            <Text
              style={[styles.modeTabLabel, tab === "composition" && styles.modeTabLabelOn]}
              numberOfLines={1}
            >
              成分表
            </Text>
          </Pressable>
        </View>

        {/* flex 行で FlatList は minWidth:0 無しだと幅を取りすぎて右の「＋」が画面外へ押し出される */}
        <View style={styles.restaurantListSlot}>
          <DraggableFlatList
            horizontal
            data={restaurants}
            keyExtractor={(r) => r.id}
            renderItem={renderRestaurantDraggableItem}
            onDragEnd={handleRestaurantDragEnd}
            activationDistance={10}
            showsHorizontalScrollIndicator={false}
            style={styles.restaurantScroll}
            contentContainerStyle={styles.restaurantTabRowContent}
          />
        </View>
        {onOpenRestaurantAdd ? (
          <Pressable
            onPress={onOpenRestaurantAdd}
            style={({ pressed }) => [styles.restaurantPlusBtn, pressed && { opacity: 0.75 }]}
            accessibilityLabel="お店を追加"
            hitSlop={6}
          >
            <Text style={styles.restaurantPlusGlyph}>＋</Text>
          </Pressable>
        ) : null}
      </View>

      <TextInput
        value={tab === "composition" ? compositionQuery : query}
        onChangeText={tab === "composition" ? setCompositionQuery : setQuery}
        placeholder={
          tab === "favorites"
            ? "お気に入りを検索"
            : tab === "composition"
              ? "成分表を検索（例: さけ 生）"
              : "メニューを検索"
        }
        placeholderTextColor="#6b7280"
        style={styles.search}
      />

      <View style={styles.contentArea}>
        {tab === "composition" ? (
          <View style={styles.compositionArea}>
            <StandardFoodCompositionPanel
              supabase={supabase}
              searchQuery={compositionQuery}
              onPickFood={(row) => {
                onPickStandardFoodForMenu?.(row, null);
              }}
            />
          </View>
        ) : (
          <ScrollView
            style={styles.menuScroll}
            contentContainerStyle={[
              styles.list,
              {
                paddingBottom: menuBottomInset,
              },
            ]}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              ) : undefined
            }
          >
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color="#10b981" />
              </View>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : (
              <>
                {menuGroups.map((group) => {
            if (group.groupName === null) {
              return (
                <Fragment key={group.sectionKey}>
                  {group.items.map((item) => (
                    <MenuLineRow
                      key={item.id}
                      item={item}
                      starred={favoritedMenuItemIds.has(item.id)}
                      onToggleStar={() => {
                        void toggleFavorite(item);
                      }}
                      onAdd={(g) => onAddToCart(item, g)}
                      onEdit={onEditMenuItem ? () => onEditMenuItem(item) : undefined}
                      macroTargets={macroTargets}
                    />
                  ))}
                </Fragment>
              );
            }
            const isCollapsed = collapsedSet.has(group.sectionKey);
            return (
              <View key={group.sectionKey}>
                <Pressable
                  onPress={() => {
                    void toggleMenuGroupCollapsed(group.sectionKey);
                  }}
                  style={({ pressed }) => [
                    styles.menuGroupHeader,
                    pressed && { opacity: 0.88 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !isCollapsed }}
                >
                  <View style={styles.menuGroupHeaderInner}>
                    <Text style={styles.menuGroupChevron}>{isCollapsed ? "▶" : "▼"}</Text>
                    <Text style={styles.menuGroupTitle} numberOfLines={1}>
                      {group.groupName}（{group.items.length}品）
                    </Text>
                  </View>
                </Pressable>
                {!isCollapsed
                  ? group.items.map((item) => (
                      <MenuLineRow
                        key={item.id}
                        item={item}
                        starred={favoritedMenuItemIds.has(item.id)}
                        onToggleStar={() => {
                          void toggleFavorite(item);
                        }}
                        onAdd={(g) => onAddToCart(item, g)}
                        onEdit={onEditMenuItem ? () => onEditMenuItem(item) : undefined}
                        macroTargets={macroTargets}
                      />
                    ))
                  : null}
              </View>
            );
                })}
                {tab === "shops" &&
                selectedRestaurantId &&
                onOpenMenuEditorAdd &&
                restaurants.length > 0 ? (
                  <Pressable
                    onPress={() => onOpenMenuEditorAdd(selectedRestaurantId)}
                    style={({ pressed }) => [styles.addMenuItemRow, pressed && { opacity: 0.9 }]}
                    accessibilityLabel="メニューを追加"
                  >
                    <Text style={styles.addMenuItemText}>＋ メニューを追加</Text>
                  </Pressable>
                ) : null}
                {tab === "shops" && selectedShop && restaurants.length > 0 ? (
                  <View style={styles.shopActionsBlock}>
                    <View style={styles.jsonBtnRow}>
                      <Pressable
                        onPress={() => {
                          void handleDownloadRestaurantJson();
                        }}
                        style={({ pressed }) => [styles.jsonBtn, pressed && { opacity: 0.88 }]}
                      >
                        <Text style={styles.jsonBtnText}>JSONでエクスポート</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setImportMenuOpen(true)}
                        style={({ pressed }) => [styles.jsonBtn, pressed && { opacity: 0.88 }]}
                      >
                        <Text style={styles.jsonBtnText}>JSONでメニューを追加</Text>
                      </Pressable>
                    </View>
                    {confirmDeleteRestaurant ? (
                      <View style={styles.delConfirmRow}>
                        <Pressable
                          onPress={() => setConfirmDeleteRestaurant(false)}
                          style={({ pressed }) => [styles.delCancelBtn, pressed && { opacity: 0.9 }]}
                        >
                          <Text style={styles.delCancelText}>キャンセル</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            void handleDeleteRestaurant();
                          }}
                          disabled={deletingRestaurant}
                          style={({ pressed }) => [
                            styles.delGoBtn,
                            (deletingRestaurant || pressed) && { opacity: 0.85 },
                            deletingRestaurant && { opacity: 0.5 },
                          ]}
                        >
                          <Text style={styles.delGoText}>
                            {deletingRestaurant ? "削除中..." : "削除する"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setConfirmDeleteRestaurant(true)}
                        style={({ pressed }) => [styles.delHintBtn, pressed && { opacity: 0.88 }]}
                      >
                        <Text style={styles.delHintText}>このお店を削除</Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}
                {tab === "favorites" && menuGroups.length === 0 ? (
                  <Text style={styles.empty}>お気に入りがありません</Text>
                ) : null}
                {tab === "shops" && restaurants.length === 0 ? (
                  <Text style={styles.empty}>店舗がありません</Text>
                ) : null}
                {tab === "shops" && restaurants.length > 0 && menuGroups.length === 0 ? (
                  <Text style={styles.empty}>この店舗にメニューがありません</Text>
                ) : null}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <RenameRestaurantModal
        visible={renameRestaurantTarget != null}
        supabase={supabase}
        userId={userId}
        restaurantId={renameRestaurantTarget?.id ?? null}
        initialName={renameRestaurantTarget?.name ?? ""}
        onClose={() => setRenameRestaurantTarget(null)}
        onRenamed={handleRestaurantRenamed}
        onToast={onToast}
      />

      <ImportMenuItemsModal
        visible={importMenuOpen}
        supabase={supabase}
        userId={userId}
        restaurantId={selectedShop?.id ?? null}
        restaurantName={selectedShop?.name ?? ""}
        onClose={() => setImportMenuOpen(false)}
        onImported={() => {
          void loadMenus();
          void loadFavorites();
          void refreshFavoritedIds();
        }}
        onToast={onToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** TodayScreen の PFC ブロックと同じ全幅ストリップ（左右の余白カードはやめる） */
  wrap: {
    flex: 1,
    minHeight: 0,
    marginTop: 0,
    marginHorizontal: 0,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#111827",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2937",
    gap: 10,
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
  },
  compositionArea: {
    flex: 1,
    minHeight: 0,
  },
  menuScroll: {
    flex: 1,
    minHeight: 0,
  },
  switchRow: { flexDirection: "row", alignItems: "stretch", gap: 4, minWidth: 0 },
  /** お気に入り・成分表を店舗タブ行の左に詰めて並べる（枠ボタンは使わない） */
  leftModeTabs: {
    flexDirection: "row",
    alignItems: "stretch",
    flexShrink: 0,
    gap: 0,
    marginRight: 2,
  },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 38,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  /** お気に入りの星（modeTabIcon 11pt）と同程度の見た目 */
  modeTabGlyphWrap: {
    width: 16,
    minHeight: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTabOn: {
    borderBottomColor: "#10b981",
  },
  modeTabIcon: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "700",
    color: "#6b7280",
  },
  modeTabIconOn: { color: "#34d399" },
  modeTabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    maxWidth: 76,
  },
  modeTabLabelOn: { color: "#e5e7eb" },
  /** DraggableFlatList が親幅いっぱいに広がらないようにする */
  restaurantListSlot: { flex: 1, minWidth: 0, overflow: "hidden" },
  restaurantPlusBtn: {
    width: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  restaurantPlusGlyph: {
    fontSize: 22,
    lineHeight: 26,
    color: "#6b7280",
    fontWeight: "300",
  },
  addMenuItemRow: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#374151",
    borderRadius: 8,
    alignItems: "center",
  },
  addMenuItemText: { color: "#9ca3af", fontSize: 14, fontWeight: "500" },
  shopActionsBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(31, 41, 55, 0.65)",
    gap: 8,
  },
  jsonBtnRow: { flexDirection: "row", gap: 8 },
  jsonBtn: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.4)",
  },
  jsonBtnText: { color: "#6b7280", fontSize: 11, fontWeight: "500" },
  delConfirmRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  delCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1f2937",
    alignItems: "center",
  },
  delCancelText: { color: "#d1d5db", fontSize: 13, fontWeight: "500" },
  delGoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#dc2626",
    alignItems: "center",
  },
  delGoText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  delHintBtn: { paddingVertical: 6, alignItems: "center" },
  delHintText: { color: "#f87171", fontSize: 11, fontWeight: "500" },
  restaurantScroll: { flex: 1 },
  /** Web `SortableRestaurantTabs` に近い: 下線で選択、左に並べ替え用ハンドル */
  restaurantTabRowContent: {
    paddingRight: 8,
    alignItems: "stretch",
  },
  restaurantTabStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "flex-start",
    maxWidth: 200,
    minHeight: 38,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: 2,
  },
  restaurantTabStripOn: {
    borderBottomColor: "#10b981",
  },
  restaurantTabStripDragging: {
    opacity: 0.92,
  },
  restaurantDragHandle: {
    paddingLeft: 2,
    paddingRight: 2,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 28,
  },
  restaurantDragHandleGlyph: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
  },
  restaurantNameHit: {
    flexShrink: 1,
    justifyContent: "center",
    paddingRight: 6,
    paddingLeft: 2,
    minWidth: 0,
  },
  restaurantNameText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    maxWidth: 164,
  },
  restaurantNameTextOn: {
    color: "#f9fafb",
  },
  search: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 0,
    color: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  center: { alignItems: "center", paddingVertical: 20 },
  error: { color: "#fecaca", fontSize: 12, paddingVertical: 8 },
  list: { gap: 7, paddingBottom: 24 },
  /** Web `MenuItemList` のグループ見出しに近い */
  menuGroupHeader: {
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(17, 24, 39, 0.5)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(31, 41, 55, 0.6)",
  },
  menuGroupHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  menuGroupChevron: {
    color: "#9ca3af",
    fontSize: 11,
    width: 14,
    textAlign: "center",
  },
  menuGroupTitle: {
    flex: 1,
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 0,
    backgroundColor: "#111827",
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 8,
    gap: 4,
  },
  starBtn: { width: 26, alignItems: "center", justifyContent: "center" },
  star: { fontSize: 15, lineHeight: 16, color: "#6b7280", fontWeight: "600" },
  starOn: { color: "#fbbf24" },
  rankCol: { width: 18, alignItems: "center", justifyContent: "center" },
  rankText: { fontSize: 11, fontWeight: "700" },
  rowBody: { flex: 1, minWidth: 0, paddingRight: 2 },
  rowTitle: { color: "#f9fafb", fontWeight: "600", fontSize: 14 },
  rowPfc: { fontSize: 11, marginTop: 4, fontVariant: ["tabular-nums"] },
  pfcMuted: { color: "#6b7280" },
  pfcPHi: { color: "#60a5fa" },
  pfcFHi: { color: "#facc15" },
  rowPfcUnset: { color: "#6b7280" },
  gramsTap: {
    minWidth: 48,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
  },
  gramsTapText: { color: "#9ca3af", fontSize: 12, fontWeight: "600" },
  gramsInput: {
    width: 52,
    textAlign: "center",
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "#10b981",
    backgroundColor: "#0f172a",
  },
  /** Web `MenuItemRow` の「+」: 丸・緑・白文字 */
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
  plusBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 20,
    marginTop: -1,
  },
  empty: { color: "#6b7280", fontSize: 12, textAlign: "center", paddingVertical: 12 },
});
