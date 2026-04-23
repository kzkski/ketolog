import { StatusBar } from "expo-status-bar";
import { InsightsScreen } from "../../screens/InsightsScreen";

export default function InsightsRoute() {
  return (
    <>
      <InsightsScreen />
      <StatusBar style="light" />
    </>
  );
}
