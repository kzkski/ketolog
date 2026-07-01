import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type MenuBrowseSearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
};

export function MenuBrowseSearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel = "検索",
}: MenuBrowseSearchFieldProps) {
  const showClear = value.length > 0;

  return (
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
  );
}

const styles = StyleSheet.create({
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
});
