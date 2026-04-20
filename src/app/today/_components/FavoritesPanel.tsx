"use client";

/** お気に入りタブで、集約されたメニューがまだないときの案内。 */
export function FavoritesPanel({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <p className="text-center text-gray-500 text-base sm:text-sm py-8 px-4">
        お気に入りを読み込んでいます...
      </p>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-amber-300">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-amber-300/50 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-500/20"
        >
          再試行
        </button>
      </div>
    );
  }

  return (
    <p className="text-center text-gray-500 text-base sm:text-sm py-8 px-4">
      お気に入りはまだありません。各メニューの☆をタップすると、ここに集約されます。
    </p>
  );
}
