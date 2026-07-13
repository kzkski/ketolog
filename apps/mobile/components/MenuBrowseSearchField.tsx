import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type MenuBrowseSearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  crossSearchEnabled?: boolean;
  onCrossSearchChange?: (enabled: boolean) => void;
  crossSearchLabel?: string;
};

export function MenuBrowseSearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel = "検索",
  crossSearchEnabled,
  onCrossSearchChange,
  crossSearchLabel = "全店舗を横断して検索",
}: MenuBrowseSearchFieldProps) {
  const showClear = value.length > 0;
  const showCrossToggle = onCrossSearchChange !== undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#6b7280"
          style={styles.input}
          accessibilityLabel={accessibilityLabel}
          returnKeyType="search"
        />
        {showClear ? (
          <Pressable
            onPress={() => onChangeText("")}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
            accessibilityLabel="検索をクリア"
            hitSlop={8}
          >
            <Text style={styles.clearGlyph}>×</Text>
          </Pressable>
        ) : null}
      </View>
      {showCrossToggle ? (
        <Pressable
          onPress={() => onCrossSearchChange(!crossSearchEnabled)}
          style={styles.crossRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: Boolean(crossSearchEnabled) }}
          accessibilityLabel={crossSearchLabel}
        >
          <View style={[styles.checkbox, crossSearchEnabled && styles.checkboxOn]}>
            {crossSearchEnabled ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.crossLabel}>{crossSearchLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "rgba(3, 7, 18, 0.8)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  clearBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  clearBtnPressed: {
    opacity: 0.75,
  },
  clearGlyph: {
    color: "#9ca3af",
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "300",
  },
  crossRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "#4b5563",
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    borderColor: "#10b981",
    backgroundColor: "#064e3b",
  },
  checkMark: {
    color: "#6ee7b7",
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "700",
  },
  crossLabel: {
    color: "#9ca3af",
    fontSize: 12,
  },
});
