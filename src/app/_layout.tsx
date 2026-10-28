import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
import { SQLiteProvider } from "expo-sqlite";
import { Suspense } from "react";
import { initializeDatabase } from "../data/database";

const GOLD = "#B69A68";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Suspense fallback={<View style={{ flex: 1, backgroundColor: "#101113", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={GOLD} /><Text style={{ color: "#D4C7AC", marginTop: 12 }}>Opening your chronicle…</Text></View>}>
        <SQLiteProvider databaseName="iron-chronicles.db" onInit={initializeDatabase} useSuspense>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#101113" } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="workout-active" />
            <Stack.Screen name="workout/[id]" />
            <Stack.Screen name="exercise/[id]" />
            <Stack.Screen name="routine-editor" />
            <Stack.Screen name="exercise-create" />
            <Stack.Screen name="settings" />
          </Stack>
        </SQLiteProvider>
      </Suspense>
    </>
  );
}
