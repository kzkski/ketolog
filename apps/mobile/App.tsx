import { StatusBar } from "expo-status-bar";
import { sumPfc } from "@ketolog/domain/pfc";
import { toJstDateString } from "@ketolog/domain/date";
import { getMealTypeForTimeZone } from "@ketolog/domain/meal-timezone";
import type { PfcGrams, MealType } from "@ketolog/types";
import { StyleSheet, Text, View } from "react-native";

const sample: PfcGrams = sumPfc({ p: 1, f: 0, c: 0 });
const today = toJstDateString();
const meal: MealType = getMealTypeForTimeZone(new Date(), "Asia/Tokyo");

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Ketolog Mobile (PoC)</Text>
      <Text style={styles.hint}>
        {today} / {meal} / P{sample.p.toFixed(0)}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: "#666",
  },
});
