import { Redirect, Stack } from "expo-router";
import { useAuthSessionContext } from "../../contexts/AuthSessionContext";

export default function AuthGroupLayout() {
  const { session, loading } = useAuthSessionContext();
  if (!loading && session) {
    return <Redirect href="/(app)/today" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
