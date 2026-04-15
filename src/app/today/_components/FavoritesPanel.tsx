"use client";

/** お気に入りタブで、集約されたメニューがまだないときの案内。 */
export function FavoritesPanel() {
  return (
    <p className="text-center text-gray-500 text-base sm:text-sm py-8 px-4">
      お気に入りはまだありません。各メニューの☆をタップすると、ここに集約されます。
    </p>
  );
}
