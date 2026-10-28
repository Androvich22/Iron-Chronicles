import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { searchExercises, type Exercise } from "../data/exerciseRepository";
import { getExerciseArtwork } from "../data/exerciseArtwork";
import { addSet, addWorkoutExercise, clearRestTimer, completeWorkoutSet, extendRestTimer, finishWorkout, getActiveWorkout, listWorkoutExercises, omitWorkoutExercise, toggleSetType, updateSetValue, type WorkoutExercise, type WorkoutSet } from "../data/workoutRepository";
import { cancelRestTimerAlert, scheduleRestTimerAlert } from "../data/restTimerNotifications";

const C = { bg: "#101113", panel: "#191A1D", raised: "#242326", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC", green: "#83A989" };
type ActiveWorkout = NonNullable<Awaited<ReturnType<typeof getActiveWorkout>>>;

function clockString(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function SetRow({ set, unitLoad, onSave, onToggleType, onComplete }: { set: WorkoutSet; unitLoad: boolean; onSave: (field: "repetitions" | "load_kg", text: string) => void; onToggleType: () => void; onComplete: () => void }) {
  const [repsText, setRepsText] = useState(set.repetitions?.toString() ?? "");
  const [loadText, setLoadText] = useState(set.loadKg?.toString() ?? "");
  return (
    <View style={[styles.setRow, set.isCompleted && styles.setRowDone]}>
      <Text style={[styles.setNumber, set.isCompleted && styles.setNumberDone]}>{set.orderIndex + 1}</Text>
      {unitLoad ? <Text style={styles.setDash}>—</Text> : <TextInput accessibilityLabel={`Set ${set.orderIndex + 1} weight in kilograms`} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor="#77736D" value={loadText} onChangeText={(text) => { setLoadText(text); onSave("load_kg", text); }} style={[styles.valueInput, set.isCompleted && styles.valueInputDone]} />}
      <TextInput accessibilityLabel={`Set ${set.orderIndex + 1} repetitions`} keyboardType="number-pad" placeholder="reps" placeholderTextColor="#77736D" value={repsText} onChangeText={(text) => { setRepsText(text); onSave("repetitions", text); }} style={[styles.valueInput, set.isCompleted && styles.valueInputDone]} />
      <Pressable accessibilityRole="button" accessibilityLabel={set.setType === "warm_up" ? "Warm-up set. Change to working set." : "Working set. Change to warm-up set."} accessibilityHint="Warm-up sets are excluded from personal records and strength trends." onPress={onToggleType} style={[styles.setTypeButton, set.setType === "warm_up" ? styles.warmTypeButton : styles.workingTypeButton]}><Text style={[styles.setTypeText, set.setType === "warm_up" ? styles.warmText : styles.workingText]}>{set.setType === "warm_up" ? "WARM-UP" : "WORKING"}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={set.isCompleted ? "Set completed" : "Complete set"} accessibilityState={{ checked: set.isCompleted, disabled: set.isCompleted }} onPress={onComplete} disabled={set.isCompleted} style={[styles.completeButton, set.isCompleted && styles.completeButtonDone]}><Text style={[styles.completeGlyph, set.isCompleted && styles.completeGlyphDone]}>{set.isCompleted ? "✓" : "○"}</Text></Pressable>
    </View>
  );
}

export default function ActiveWorkoutScreen() {
  const db = useSQLiteContext();
  const { workoutId: routeId } = useLocalSearchParams<{ workoutId?: string }>();
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Exercise[]>([]);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const active = await getActiveWorkout(db);
    if (!active || (routeId && active.id !== routeId)) { setWorkout(null); setExercises([]); return; }
    const list = await listWorkoutExercises(db, active.id);
    setWorkout(active);
    setExercises(list);
    setNow(Date.now());
  }, [db, routeId]);

  useEffect(() => {
    let current = true;
    getActiveWorkout(db)
      .then(async (active) => {
        if (!current || !active || (routeId && active.id !== routeId)) { if (current) { setWorkout(null); setExercises([]); } return; }
        const list = await listWorkoutExercises(db, active.id);
        if (current) { setWorkout(active); setExercises(list); setNow(Date.now()); }
      })
      .catch(() => { if (current) setError("Could not load this workout."); });
    return () => { current = false; };
  }, [db, routeId]);
  useEffect(() => {
    if (!searching) return;
    let current = true;
    searchExercises(db, query).then((result) => { if (current) setMatches(result); }).catch(() => { if (current) setError("Exercise search is unavailable right now."); });
    return () => { current = false; };
  }, [db, query, searching]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const editSet = async (setId: string, field: "repetitions" | "load_kg", text: string) => {
    const trimmed = text.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && !Number.isFinite(value)) return;
    try { await updateSetValue(db, setId, field, value); } catch { setError("Set values must be positive numbers."); }
  };

  const pickExercise = async (exercise: Exercise) => {
    if (!workout) return;
    Keyboard.dismiss();
    setError(null);
    await addWorkoutExercise(db, workout.id, exercise);
    setSearching(false);
    setQuery("");
    await refresh();
  };

  const restEnd = workout?.rest_timer_end_at ? new Date(workout.rest_timer_end_at).getTime() : null;
  const remaining = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : null;
  const elapsed = workout ? Math.max(0, Math.floor((now - new Date(workout.started_at).getTime()) / 1000)) : 0;

  if (!workout) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.missing}><Text style={styles.wordmark}>IRON CHRONICLES</Text><Text style={styles.title}>No active workout</Text><Text style={styles.body}>Start a new session from Workouts to begin logging.</Text><Pressable onPress={() => router.replace("/workouts")} style={styles.primary}><Text style={styles.primaryText}>BACK TO WORKOUTS</Text></Pressable></View></SafeAreaView>;
  }

  const addNewSet = async (exerciseId: string) => { await addSet(db, exerciseId); await refresh(); };
  const toggleType = async (set: WorkoutSet) => { await toggleSetType(db, set.id, set.setType); await refresh(); };
  const completeSet = async (exercise: WorkoutExercise, set: WorkoutSet) => {
    try { const timerEnd = await completeWorkoutSet(db, workout.id, set.id, exercise.restSeconds ?? 90); if (timerEnd) await scheduleRestTimerAlert(db, timerEnd); setError(null); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not complete set."); }
  };
  const skipRestTimer = async () => { await clearRestTimer(db, workout.id); await cancelRestTimerAlert(db); await refresh(); };
  const addRestTime = async () => { await extendRestTimer(db, workout.id, 90); const active = await getActiveWorkout(db); if (active?.rest_timer_end_at) await scheduleRestTimerAlert(db, active.rest_timer_end_at); await refresh(); };
  const removeExercise = (exercise: WorkoutExercise) => Alert.alert("Remove exercise?", "Its sets will stay saved in this workout, but it will be hidden from the active session.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => { void omitWorkoutExercise(db, exercise.id).then(refresh).catch(() => setError("Could not remove this exercise.")); } },
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Image source={require("../../assets/images/chronicle-atmosphere.png")} resizeMode="cover" pointerEvents="none" accessible={false} style={styles.atmosphere} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.header}><Pressable onPress={() => router.replace("/workouts")} style={styles.back}><Text style={styles.backGlyph}>‹</Text></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>THE FORGE · SESSION</Text><Text style={styles.title}>{workout.routine_name_snapshot ?? "Empty Workout"}</Text></View><Text style={styles.elapsed}>{clockString(elapsed)}</Text></View>

        {remaining !== null ? <View style={styles.timer}><View><Text style={styles.timerLabel}>{remaining > 0 ? "REST TIMER" : "REST COMPLETE"}</Text><Text style={styles.timerTime}>{clockString(remaining)}</Text></View><View style={styles.timerActions}>{remaining > 0 ? <Pressable onPress={() => void skipRestTimer()} style={styles.timerButton}><Text style={styles.timerButtonText}>SKIP</Text></Pressable> : null}<Pressable onPress={() => void addRestTime()} style={styles.timerButton}><Text style={styles.timerButtonText}>+ 90</Text></Pressable></View></View> : null}

        {searching ? <View style={styles.picker}><Text style={styles.pickerTitle}>ADD MOVEMENT</Text><TextInput accessibilityLabel="Search movements" autoFocus placeholder="Search exercises" placeholderTextColor="#77736D" value={query} onChangeText={setQuery} style={styles.search} />{matches.slice(0, 12).map((exercise) => <Pressable key={exercise.id} onPress={() => void pickExercise(exercise)} style={styles.match}><Image source={getExerciseArtwork(exercise.id)} style={styles.matchImage} resizeMode="cover" /><View style={styles.matchCopy}><Text style={styles.matchName}>{exercise.name}</Text><Text style={styles.matchMeta}>{exercise.primaryMuscleGroup} · {exercise.equipment}</Text></View><Text style={styles.matchAdd}>＋</Text></Pressable>)}{matches.length === 0 ? <Text style={styles.emptyHint}>No matching exercises.</Text> : null}</View> : <Pressable onPress={() => { setMatches([]); setSearching(true); }} style={styles.addExercise}><Text style={styles.addGlyph}>＋</Text><Text style={styles.addText}>Add exercise</Text><Text style={styles.arrow}>›</Text></Pressable>}

        {exercises.map((exercise) => <View key={exercise.id} style={styles.exerciseCard}>
          <View style={styles.exerciseHead}><Pressable onPress={() => exercise.exerciseId && router.push({ pathname: "/exercise/[id]", params: { id: exercise.exerciseId } })} style={styles.exerciseIdentity}><Image source={getExerciseArtwork(exercise.exerciseId ?? "")} style={styles.crest} resizeMode="cover" /><View style={styles.exerciseCopy}><Text style={styles.exerciseName}>{exercise.name}</Text><Text style={styles.exerciseMeta}>{exercise.primaryMuscleGroup} · {exercise.equipment}{exercise.targetSetCount ? ` · ${exercise.targetSetCount} × ${exercise.targetRepMin}–${exercise.targetRepMax}` : ""}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exercise.name} from this workout`} onPress={() => removeExercise(exercise)} style={styles.removeExercise}><Text style={styles.removeExerciseText}>×</Text></Pressable></View>
          <View style={styles.tableHead}><Text style={styles.tableHeadText}>SET</Text><Text style={styles.tableHeadText}>{exercise.loadType === "bodyweight" ? "—" : "KG"}</Text><Text style={styles.tableHeadText}>REPS</Text><Text style={styles.tableHeadText}>SET TYPE</Text><Text style={styles.tableHeadText}>DONE</Text></View>
          <Text style={styles.typeHint}>Warm-up prepares you. Working sets count toward records and strength trends.</Text>
          {exercise.sets.map((set) => <SetRow key={set.id} set={set} unitLoad={exercise.loadType === "bodyweight"} onSave={(field, value) => { void editSet(set.id, field, value); }} onToggleType={() => { void toggleType(set); }} onComplete={() => { void completeSet(exercise, set); }} />)}
          <Pressable onPress={() => void addNewSet(exercise.id)} style={styles.addSet}><Text style={styles.addSetText}>＋  Add set</Text></Pressable>
        </View>)}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable disabled={saving} onPress={async () => { setSaving(true); try { await finishWorkout(db, workout.id); await cancelRestTimerAlert(db); router.replace({ pathname: "/workout/[id]", params: { id: workout.id } }); } catch { setError("Could not finish this session."); } finally { setSaving(false); } }} style={styles.finish}><Text style={styles.finishText}>{saving ? "SAVING…" : "FINISH WORKOUT"}</Text></Pressable>
        <Text style={styles.saveNote}>Your entries save as you make them. Returning later resumes this session.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, atmosphere: { position: "absolute", top: 0, left: 0, right: 0, width: "100%", height: 280 }, content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 }, header: { flexDirection: "row", alignItems: "center", marginBottom: 16 }, back: { width: 38, height: 38, borderWidth: 1, borderColor: C.line, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 11 }, backGlyph: { color: C.parchment, fontSize: 26, marginTop: -3 }, headerCopy: { flex: 1 }, eyebrow: { color: C.gold, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 }, title: { color: C.text, fontFamily: "serif", fontSize: 21 }, elapsed: { color: C.gold, fontSize: 14, fontVariant: ["tabular-nums"] },
  timer: { backgroundColor: "#211E1A", borderWidth: 1, borderColor: "#725A39", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, timerLabel: { color: C.gold, fontSize: 9, letterSpacing: 1.4 }, timerTime: { color: C.text, fontSize: 24, fontWeight: "600", fontVariant: ["tabular-nums"], marginTop: 2 }, timerActions: { flexDirection: "row", gap: 8 }, timerButton: { borderColor: "#725A39", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }, timerButtonText: { color: C.parchment, fontSize: 11, fontWeight: "600" },
  addExercise: { minHeight: 50, flexDirection: "row", alignItems: "center", backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingHorizontal: 13, marginBottom: 13 }, addGlyph: { color: C.gold, fontSize: 20, marginRight: 10 }, addText: { color: C.parchment, fontSize: 13, flex: 1 }, arrow: { color: C.gold, fontSize: 21 },
  picker: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginBottom: 13 }, pickerTitle: { color: C.gold, fontSize: 10, letterSpacing: 1.4, fontWeight: "700" }, search: { height: 43, borderWidth: 1, borderColor: C.line, borderRadius: 7, color: C.text, paddingHorizontal: 11, marginTop: 10, marginBottom: 6 }, match: { minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.line, paddingRight: 27 }, matchImage: { width: 42, height: 42, borderRadius: 7, marginRight: 10 }, matchCopy: { flex: 1 }, matchName: { color: C.text, fontSize: 13, fontWeight: "600" }, matchMeta: { color: C.muted, fontSize: 10, marginTop: 3 }, matchAdd: { color: C.gold, fontSize: 19 }, emptyHint: { color: C.muted, textAlign: "center", fontSize: 12, padding: 14 },
  exerciseCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, marginBottom: 12 }, exerciseHead: { minHeight: 53, flexDirection: "row", alignItems: "center", paddingHorizontal: 2 }, exerciseIdentity: { flex: 1, flexDirection: "row", alignItems: "center" }, crest: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: "#514633", marginRight: 10 }, exerciseCopy: { flex: 1 }, exerciseName: { color: C.text, fontWeight: "600", fontSize: 14 }, exerciseMeta: { color: C.muted, fontSize: 10, marginTop: 4 }, removeExercise: { width: 34, height: 38, alignItems: "center", justifyContent: "center", marginLeft: 3 }, removeExerciseText: { color: "#B97868", fontSize: 22 },
  tableHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, marginTop: 10, marginBottom: 6 }, tableHeadText: { color: C.muted, fontSize: 8, letterSpacing: 0.7, width: "19%", textAlign: "center" }, typeHint: { color: "#A69B86", fontSize: 9, lineHeight: 14, marginHorizontal: 2, marginBottom: 6 }, setRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopColor: "#2D2C2F", borderTopWidth: 1, borderRadius: 5, paddingHorizontal: 2 }, setRowDone: { backgroundColor: "#18211C", borderTopColor: "#35483A", borderBottomWidth: 1, borderBottomColor: "#35483A", borderLeftWidth: 2, borderLeftColor: C.green }, setNumber: { color: C.muted, fontSize: 12, width: "10%", textAlign: "center" }, setNumberDone: { color: "#B9D3BB", fontWeight: "700" }, setDash: { color: C.muted, width: "19%", textAlign: "center" }, valueInput: { height: 34, width: "19%", borderRadius: 6, borderColor: C.line, borderWidth: 1, backgroundColor: "#121214", color: C.text, fontSize: 13, textAlign: "center", paddingVertical: 0 }, valueInputDone: { borderColor: "#3C5742", backgroundColor: "#1E2A22", color: "#DCE9D8" }, setTypeButton: { width: "19%", minHeight: 28, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 2 }, warmTypeButton: { borderColor: "#645332", backgroundColor: "#252117" }, workingTypeButton: { borderColor: "#39383A", backgroundColor: "#202023" }, setTypeText: { color: C.muted, fontSize: 7, fontWeight: "700", letterSpacing: 0.15 }, warmText: { color: "#E2BF72" }, workingText: { color: "#C5BFB4" }, completeButton: { width: "12%", height: 34, borderWidth: 1, borderColor: "#454348", borderRadius: 18, backgroundColor: "#121214", alignItems: "center", justifyContent: "center" }, completeButtonDone: { borderColor: "#65836B", backgroundColor: "#24402C" }, completeGlyph: { color: "#938C82", fontSize: 17 }, completeGlyphDone: { color: "#BFE0C1", fontWeight: "800", fontSize: 18 },
  addSet: { height: 38, marginTop: 7, borderWidth: 1, borderColor: C.line, borderRadius: 7, alignItems: "center", justifyContent: "center" }, addSetText: { color: C.gold, fontSize: 11, letterSpacing: 0.5 }, finish: { height: 50, borderRadius: 9, backgroundColor: "#682D2E", borderColor: "#8E4140", borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 8 }, finishText: { color: "#FFF0E5", fontSize: 12, fontWeight: "700", letterSpacing: 1 }, saveNote: { color: "#77726B", textAlign: "center", fontSize: 10, lineHeight: 15, marginTop: 10 }, error: { color: "#DB8D77", fontSize: 12, marginBottom: 9 }, missing: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }, wordmark: { color: C.gold, fontFamily: "serif", letterSpacing: 2.5, marginBottom: 24 }, body: { color: C.muted, textAlign: "center", marginTop: 8, lineHeight: 19 }, primary: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 8, backgroundColor: C.ember }, primaryText: { color: "#FFF5E7", fontWeight: "700", letterSpacing: 0.8, fontSize: 11 },
});
