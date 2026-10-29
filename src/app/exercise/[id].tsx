import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../../components/AtmosphereBackground";
import { addWorkoutExercise, getActiveWorkout, getExerciseById, getPreviousExercisePerformance, startOrResumeWorkout } from "../../data/workoutRepository";
import type { Exercise } from "../../data/exerciseRepository";
import { getExerciseArtwork } from "../../data/exerciseArtwork";
import { archiveCustomExercise } from "../../data/exerciseRepository";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };

export default function ExerciseDetailScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [previous, setPrevious] = useState<Awaited<ReturnType<typeof getPreviousExercisePerformance>>>(null);
  const [adding, setAdding] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([getExerciseById(db, id), getPreviousExercisePerformance(db, id)]).then(([result, performance]) => {
      if (active) { setExercise(result); setPrevious(performance); }
    });
    return () => { active = false; };
  }, [db, id]));

  if (!exercise) return <SafeAreaView style={styles.safe} edges={["top"]}><AtmosphereBackground scene="armory" /><View style={styles.loading}><Text style={styles.wordmark}>IRON CHRONICLES</Text><Text style={styles.empty}>Loading exercise…</Text></View></SafeAreaView>;

  const loadLabel = exercise.loadType === "bodyweight" ? "Bodyweight" : exercise.loadType === "bodyweight_added_load" ? "Bodyweight with optional added load" : "External load (kg)";

  const addToWorkout = async () => {
    setAdding(true);
    try {
      const active = await getActiveWorkout(db);
      const workoutId = active?.id ?? await startOrResumeWorkout(db);
      await addWorkoutExercise(db, workoutId, exercise);
      router.push({ pathname: "/workout-active", params: { workoutId } });
    } finally {
      setAdding(false);
    }
  };

  const archive = () => Alert.alert("Archive custom exercise?", "It will be hidden from the library. Existing workout and routine records will remain saved.", [
    { text: "Cancel", style: "cancel" },
    { text: "Archive", style: "destructive", onPress: () => { void archiveCustomExercise(db, exercise.id).then(() => router.back()).catch(() => Alert.alert("Could not archive", "Please try again.")); } },
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AtmosphereBackground scene="armory" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topline}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backGlyph}>‹</Text></Pressable><Text style={styles.wordmark}>THE LIBRARY</Text></View>
        <View style={styles.illustration}><Image source={getExerciseArtwork(exercise.id)} style={styles.illustrationImage} resizeMode="cover" /><View style={styles.illustrationScrim}><Text style={styles.illustrationLabel}>MOVEMENT RECORD</Text></View></View>
        <Text style={styles.title}>{exercise.name}</Text>
        <Text style={styles.subtitle}>{exercise.primaryMuscleGroup}  ·  {exercise.equipment}</Text>
        {exercise.source === "user" ? <View style={styles.customActions}><Pressable onPress={() => router.push({ pathname: "/exercise-create", params: { exerciseId: exercise.id } })} style={styles.customButton}><Text style={styles.customText}>EDIT CUSTOM EXERCISE</Text></Pressable><Pressable onPress={archive} style={styles.archiveButton}><Text style={styles.archiveText}>ARCHIVE</Text></Pressable></View> : null}

        <View style={styles.infoGrid}><Info label="PRIMARY MUSCLE" value={exercise.primaryMuscleGroup} /><Info label="EQUIPMENT" value={exercise.equipment} /><Info label="ALSO WORKS" value={exercise.secondaryMuscleGroups.length ? exercise.secondaryMuscleGroups.join(", ") : "—"} /><Info label="LOAD STYLE" value={loadLabel} /></View>

        <Text style={styles.sectionTitle}>HOW TO PERFORM</Text>
        <View style={styles.instruction}><Text style={styles.instructionNumber}>01</Text><Text style={styles.instructionText}>{exercise.instructions ?? "No movement notes have been added yet."}</Text></View>
        <Text style={styles.sectionTitle}>PREVIOUS PERFORMANCE</Text>
        <View style={styles.instruction}><Text style={styles.instructionNumber}>↺</Text><Text style={styles.instructionText}>{previous ? `${new Date(previous.completed_at).toLocaleDateString()} · ${previous.set_count} working sets · ${previous.total_reps} reps${previous.best_external_load !== null ? ` · best load ${previous.best_external_load} kg` : ""}${previous.recorded_volume !== null ? ` · ${previous.recorded_volume.toLocaleString()} kg recorded volume` : ""}` : "No completed working sets for this movement yet."}</Text></View>
        <View style={styles.tracking}><Text style={styles.trackingLabel}>TRACKING</Text><Text style={styles.trackingValue}>{exercise.trackingType === "loaded_reps" ? "Repetitions and load in kilograms" : "Repetitions"}</Text></View>
        <Pressable disabled={adding} onPress={() => void addToWorkout()} style={[styles.button, adding && { opacity: 0.65 }]}><Text style={styles.buttonText}>{adding ? "ADDING…" : "ADD TO WORKOUT"}</Text></Pressable>
        <Text style={styles.disclaimer}>Use a comfortable range of motion and choose a load you can control.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }, loading: { flex: 1, justifyContent: "center", alignItems: "center" }, wordmark: { color: C.gold, fontSize: 11, letterSpacing: 2.5, fontFamily: "serif" }, empty: { color: C.muted, marginTop: 14 }, topline: { height: 38, flexDirection: "row", alignItems: "center", marginBottom: 14 }, back: { width: 36, height: 36, borderColor: C.line, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 }, backGlyph: { color: C.parchment, fontSize: 24, marginTop: -3 },
  illustration: { height: 200, overflow: "hidden", borderRadius: 12, borderColor: "#514633", borderWidth: 1, backgroundColor: "#201E1B", marginBottom: 18 }, illustrationImage: { width: "100%", height: "100%" }, illustrationScrim: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10, backgroundColor: "rgba(10,10,11,0.65)" }, illustrationLabel: { color: "#E1C58E", fontSize: 9, letterSpacing: 2 }, title: { color: C.text, fontSize: 27, fontFamily: "serif" }, subtitle: { color: C.muted, fontSize: 12, marginTop: 6 }, customActions: { flexDirection: "row", gap: 8, marginTop: 14 }, customButton: { minHeight: 38, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line, borderRadius: 7 }, customText: { color: C.gold, fontSize: 9, fontWeight: "700", letterSpacing: 0.7 }, archiveButton: { minHeight: 38, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#583B37", borderRadius: 7 }, archiveText: { color: "#C38272", fontSize: 9, fontWeight: "700", letterSpacing: 0.7 }, infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 }, info: { width: "48%", minHeight: 65, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 10, justifyContent: "center" }, infoLabel: { color: C.gold, fontSize: 8, letterSpacing: 1 }, infoValue: { color: C.parchment, fontSize: 11, marginTop: 6, lineHeight: 15 }, sectionTitle: { color: C.parchment, fontSize: 17, fontFamily: "serif", marginTop: 25, marginBottom: 10 }, instruction: { flexDirection: "row", gap: 12, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 9, padding: 14 }, instructionNumber: { color: C.gold, fontSize: 13, fontWeight: "700" }, instructionText: { color: C.text, flex: 1, fontSize: 13, lineHeight: 20 }, tracking: { marginTop: 12, borderBottomColor: C.line, borderBottomWidth: 1, paddingVertical: 12 }, trackingLabel: { color: C.muted, fontSize: 9, letterSpacing: 1.3 }, trackingValue: { color: C.parchment, fontSize: 12, marginTop: 5 }, button: { minHeight: 48, backgroundColor: C.ember, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 22, borderColor: "#B2674A", borderWidth: 1 }, buttonText: { color: "#FFF5E7", fontSize: 11, fontWeight: "700", letterSpacing: 1 }, disclaimer: { color: "#77726B", textAlign: "center", lineHeight: 16, fontSize: 10, marginTop: 11 } });
