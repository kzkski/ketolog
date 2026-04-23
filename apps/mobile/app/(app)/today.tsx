import { StatusBar } from "expo-status-bar";
import { TodayScreen } from "../../screens/TodayScreen";

export default function TodayRoute() {
  return (
    <>
      <TodayScreen />
      <StatusBar style="light" />
    </>
  );
}
