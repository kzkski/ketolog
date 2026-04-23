/** メニュー選択から食事追加フォームへ渡す最小ペイロード */
export type MenuPrefill = {
  menuItemId: string;
  restaurantId: string;
  itemName: string;
  proteinPer100: number | null;
  fatPer100: number | null;
  carbsPer100: number | null;
  defaultGrams: number;
};
