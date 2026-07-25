import { Pressable, StyleSheet, Text } from "react-native";
import {
  canHalveGrams,
  HALF_GRAMS_ARIA_LABEL,
  HALF_GRAMS_HINT,
  HALF_GRAMS_LABEL,
  HALF_GRAMS_LABEL_FULL,
  halveGrams,
} from "@ketolog/domain/cart-serving";

type Props = {
  value: number;
  disabled?: boolean;
  size?: "compact" | "mini" | "full";
  onHalve: (next: number) => void;
};

export function HalfGramsButton({
  value,
  disabled = false,
  size = "compact",
  onHalve,
}: Props) {
  const blocked = disabled || !canHalveGrams(value);

  return (
    <Pressable
      disabled={blocked}
      onPress={() => onHalve(halveGrams(value))}
      hitSlop={size === "mini" ? { top: 8, bottom: 4, left: 8, right: 8 } : 6}
      accessibilityRole="button"
      accessibilityLabel={HALF_GRAMS_ARIA_LABEL}
      accessibilityHint={HALF_GRAMS_HINT}
      style={({ pressed }) => [
        size === "full" ? styles.full : size === "mini" ? styles.mini : styles.compact,
        blocked && { opacity: 0.4 },
        pressed && !blocked && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Text style={size === "full" ? styles.fullText : styles.labelText}>
        {size === "full" ? HALF_GRAMS_LABEL_FULL : HALF_GRAMS_LABEL}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compact: {
    minWidth: 36,
    minHeight: 36,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  mini: {
    minWidth: 40,
    minHeight: 20,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  full: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  labelText: {
    color: "#a7f3d0",
    fontSize: 13,
    fontWeight: "700",
  },
  fullText: {
    color: "#a7f3d0",
    fontSize: 14,
    fontWeight: "700",
  },
});
