import { Tabs } from "expo-router";
import { Text } from "react-native";

const GOLD = "#B69A68";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: "#88847E",
        tabBarStyle: { backgroundColor: "#121214", borderTopColor: "#343338", height: 66, paddingTop: 7, paddingBottom: 7 },
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Hall", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>⌂</Text> }} />
      <Tabs.Screen name="workouts" options={{ title: "Workouts", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚒</Text> }} />
      <Tabs.Screen name="routines" options={{ title: "Routines", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>♙</Text> }} />
      <Tabs.Screen name="progress" options={{ title: "Progress", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>▥</Text> }} />
      <Tabs.Screen name="library" options={{ title: "Library", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>♜</Text> }} />
    </Tabs>
  );
}
