import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthSessionContext } from "../../contexts/AuthSessionContext";

export default function AppGroupLayout() {
  const { session, loading } = useAuthSessionContext();
  if (!loading && !session) {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <SafeAreaProvider>
      <Tabs
        initialRouteName="today"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: "#111827",
            borderTopColor: "#374151",
          },
          tabBarActiveTintColor: "#34d399",
          tabBarInactiveTintColor: "#6b7280",
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="today"
          options={{
            title: "Today",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="nutrition-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: "分析",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
