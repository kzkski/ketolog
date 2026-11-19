import { Redirect, Stack } from "expo-router";
import { useAuthSessionContext } from "../../contexts/AuthSessionContext";
import { useAuthenticatedEntryHref } from "../../contexts/QuickActionIntentContext";

export default function AuthGroupLayout() {
  const { session, loading } = useAuthSessionContext();
  const authenticatedEntryHref = useAuthenticatedEntryHref(Boolean(session && !loading));
  if (!loading && session) {
    return <Redirect href={authenticatedEntryHref} />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
