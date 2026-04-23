import { Redirect, Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthSessionContext } from "../../contexts/AuthSessionContext";

export default function AppGroupLayout() {
  const { session, loading } = useAuthSessionContext();
  if (!loading && !session) {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
