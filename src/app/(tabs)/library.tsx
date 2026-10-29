import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../../components/AtmosphereBackground";
import { listExerciseFilters, searchExercises, type Exercise } from "../../data/exerciseRepository";
import { getExerciseArtwork } from "../../data/exerciseArtwork";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filterOptions, setFilterOptions] = useState<{ muscleGroups: string[]; equipment: string[] }>({ muscleGroups: [], equipment: [] });
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([searchExercises(db, query, { muscleGroup, equipment }), listExerciseFilters(db)])
      .then(([results, filters]) => { if (active) { setExercises(results); setFilterOptions(filters); setError(null); } })
      .catch(() => { if (active) setError("The exercise list could not be loaded. Please try again."); });
    return () => { active = false; };
  }, [db, query, muscleGroup, equipment]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AtmosphereBackground />
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.wordmark}>IRON CHRONICLES</Text>
            <Text style={styles.eyebrow}>THE LIBRARY</Text>
            <Text style={styles.title}>Exercises</Text>
            <Text style={styles.description}>A growing catalogue of movements, kept together with their training history.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/exercise-create")} style={styles.createButton}><Text style={styles.createGlyph}>＋</Text><Text style={styles.createText}>Create custom exercise</Text></Pressable>
            <TextInput
              accessibilityLabel="Search exercises"
              placeholder="Search name, muscle, or equipment"
              placeholderTextColor="#77736D"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              style={styles.search}
            />
            <Text style={styles.filterLabel}>MUSCLE GROUP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {["", ...filterOptions.muscleGroups].map((value) => <Pressable key={value || "all-muscles"} onPress={() => setMuscleGroup(value)} style={[styles.filterChip, muscleGroup === value && styles.filterChipActive]}><Text style={[styles.filterText, muscleGroup === value && styles.filterTextActive]}>{value || "All"}</Text></Pressable>)}
            </ScrollView>
            <Text style={styles.filterLabel}>EQUIPMENT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {["", ...filterOptions.equipment].map((value) => <Pressable key={value || "all-equipment"} onPress={() => setEquipment(value)} style={[styles.filterChip, equipment === value && styles.filterChipActive]}><Text style={[styles.filterText, equipment === value && styles.filterTextActive]}>{value || "All"}</Text></Pressable>)}
            </ScrollView>
            <Text style={styles.count}>{exercises.length} {exercises.length === 1 ? "MOVEMENT" : "MOVEMENTS"}</Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/exercise/[id]", params: { id: item.id } })} style={styles.row}>
            <Image source={getExerciseArtwork(item.id)} style={styles.icon} resizeMode="cover" />
            <View style={styles.copy}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{item.primaryMuscleGroup}  ·  {item.equipment}</Text></View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        )}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{error ? "Unable to show exercises" : query ? "No matching movements" : "Preparing the catalogue"}</Text><Text style={styles.emptyText}>{error ? "Your locally stored exercise records remain unchanged." : query ? "Try a different exercise, muscle group, or equipment name." : "The catalogue will appear as soon as local setup is complete."}</Text></View>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, list: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  wordmark: { color: C.gold, fontSize: 12, letterSpacing: 3, fontFamily: "serif", marginBottom: 30 }, eyebrow: { color: C.gold, fontSize: 10, letterSpacing: 2, marginBottom: 9 }, title: { color: C.text, fontSize: 31, fontFamily: "serif" }, description: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  createButton: { minHeight: 43, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginTop: 14, backgroundColor: "#211E1A", borderWidth: 1, borderColor: "#5C4930", borderRadius: 8 }, createGlyph: { color: C.gold, fontSize: 18, marginRight: 9 }, createText: { color: C.parchment, fontSize: 12, fontWeight: "600" },
  search: { height: 48, borderColor: C.line, borderWidth: 1, backgroundColor: C.panel, borderRadius: 9, color: C.text, paddingHorizontal: 14, fontSize: 13, marginTop: 14 }, filterLabel: { color: C.muted, fontSize: 8, letterSpacing: 1, marginTop: 14, marginBottom: 6 }, filters: { gap: 7, paddingRight: 18 }, filterChip: { minHeight: 30, justifyContent: "center", paddingHorizontal: 11, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.panel }, filterChipActive: { borderColor: "#806A45", backgroundColor: "#211E1A" }, filterText: { color: C.muted, fontSize: 10 }, filterTextActive: { color: C.gold, fontWeight: "600" }, count: { color: C.gold, fontWeight: "600", fontSize: 9, letterSpacing: 1.5, marginTop: 20, marginBottom: 10 },
  row: { minHeight: 70, flexDirection: "row", alignItems: "center", backgroundColor: C.panel, paddingHorizontal: 12 }, icon: { width: 48, height: 48, borderColor: "#514633", borderWidth: 1, borderRadius: 8, marginRight: 12 }, copy: { flex: 1 }, name: { color: C.text, fontSize: 14, fontWeight: "600" }, meta: { color: C.muted, fontSize: 11, marginTop: 5 }, arrow: { color: C.gold, fontSize: 21, paddingHorizontal: 3 }, separator: { height: 1, backgroundColor: C.line },
  empty: { alignItems: "center", paddingHorizontal: 24, paddingTop: 32 }, emptyTitle: { color: C.parchment, fontFamily: "serif", fontSize: 17, textAlign: "center" }, emptyText: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 8 }, error: { color: "#D88A73", fontSize: 12, marginTop: 10 },
});
