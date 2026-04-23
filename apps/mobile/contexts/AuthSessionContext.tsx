import { createContext, useContext, type ReactNode } from "react";
import { useAuthSession } from "../hooks/useAuthSession";

type AuthSessionValue = ReturnType<typeof useAuthSession>;

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const value = useAuthSession();
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSessionContext(): AuthSessionValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error("useAuthSessionContext は AuthSessionProvider 配下でのみ使えます。");
  }
  return ctx;
}
