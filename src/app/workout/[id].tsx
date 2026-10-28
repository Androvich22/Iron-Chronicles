import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getTrainingMilestones, getPersonalRecords, recalculateAchievements, type PersonalRecord, type TrainingMilestone } from "../../data/progressRepository";
import { deleteCompletedSet, deleteCompletedWorkout, getWorkoutDetail, toggleCompletedSetType, updateCompletedSet, type WorkoutDetail } from "../../data/workoutRepository";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC", green: "#83A989" };

export default function WorkoutDetailScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [milestones, setMilestones] = useState<TrainingMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      await recalculateAchievements(db);
      const [detail, personalRecords, earned] = await Promise.all([getWorkoutDetail(db, id), getPersonalRecords(db), getTrainingMilestones(db)]);
      setWorkout(detail); setRecords(personalRecords); setMilestones(earned); setError(null);
    } catch { setError("This workout could not be loaded."); }
    finally { setLoading(false); }
  }, [db, id]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const summary = useMemo(() => {
    if (!workout) return null;
    const durationMinutes = Math.max(0, Math.round((new Date(workout.completedAt).getTime() - new Date(workout.startedAt).getTime()) / 60000));
    const completedSets = workout.exercises.flatMap((exercise) => exercise.isOmitted ? [] : exercise.sets.filter((set) => set.isCompleted && set.setType === "working").map((set) => ({ exercise, set })));
    const totalReps = completedSets.reduce((sum, row) => sum + (row.set.repetitions ?? 0), 0);
    const volumeKg = completedSets.reduce((sum, row) => sum + (row.exercise.loadType === "external" && row.set.loadKg !== null ? row.set.loadKg * (row.set.repetitions ?? 0) : 0), 0);
    return { durationMinutes, completedSets: completedSets.length, totalReps, volumeKg, exerciseCount: workout.exercises.filter((exercise) => !exercise.isOmitted).length };
  }, [workout]);

  const achievedRecords = records.filter((record) => record.achievedAt === workout?.completedAt);
  const achievedMilestones = milestones.filter((milestone) => milestone.earnedAt === workout?.completedAt);
  const removeWorkout = () => Alert.alert("Delete workout?", "This removes the workout and its sets. Progress records and milestones will be recalculated.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete workout", style: "destructive", onPress: () => { void deleteCompletedWorkout(db, id).then(() => router.replace("/workouts")).catch(() => setError("This workout could not be deleted.")); } },
  ]);

  const saveSet = async (setId: string, field: "repetitions" | "load_kg", text: string) => {
    const cleaned = text.trim();
    const value = cleaned ? Number(cleaned) : null;
    try { await updateCompletedSet(db, setId, field, value); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "This set could not be updated."); }
  };
  const changeSetType = async (setId: string, current: "working" | "warm_up") => {
    try { await toggleCompletedSetType(db, setId, current); await refresh(); }
    catch { setError("This set type could not be changed."); }
  };
  const removeSet = (setId: string) => Alert.alert("Delete set?", "This set will be removed from the workout. Progress records will be recalculated.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete set", style: "destructive", onPress: () => { void deleteCompletedSet(db, setId).then(refresh).catch(() => setError("This set could not be deleted.")); } },
  ]);

  if (!workout) return <SafeAreaView style={s.safe} edges={["top"]}><View style={s.center}><Text style={s.wordmark}>THE CHRONICLE</Text><Text style={s.emptyTitle}>{loading ? "Opening workout record…" : "Workout not found"}</Text><Text style={s.emptyText}>{error ?? "This workout may have been deleted."}</Text><Pressable onPress={() => router.replace("/workouts")} style={s.backToHistory}><Text style={s.backText}>BACK TO HISTORY</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.content}>
    <View style={s.topline}><Pressable accessibilityRole="button" onPress={() => router.replace("/workouts")} style={s.back}><Text style={s.backGlyph}>‹</Text></Pressable><View style={s.topCopy}><Text style={s.eyebrow}>THE CHRONICLE · HISTORY</Text><Text style={s.title}>{workout.routineName ?? "Empty workout"}</Text></View></View>
    <Text style={s.date}>{new Date(workout.completedAt).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</Text>
    <View style={s.metrics}><Metric label="DURATION" value={`${summary?.durationMinutes ?? 0} min`} /><Metric label="EXERCISES" value={String(summary?.exerciseCount ?? 0)} /><Metric label="WORKING SETS" value={String(summary?.completedSets ?? 0)} /><Metric label="TOTAL REPS" value={(summary?.totalReps ?? 0).toLocaleString()} /></View>
    {summary?.volumeKg ? <View style={s.volume}><Text style={s.volumeLabel}>RECORDED TRAINING VOLUME</Text><Text style={s.volumeValue}>{summary.volumeKg.toLocaleString()} kg</Text></View> : null}

    {achievedRecords.length || achievedMilestones.length ? <View style={s.highlightPanel}><Text style={s.sectionTitle}>EARNED THIS SESSION</Text>{achievedRecords.map((record) => <View key={record.key} style={s.highlightRow}><Text style={s.highlightIcon}>✦</Text><Text style={s.highlightText}>{record.exerciseName} · {record.title}: {record.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} {record.unit}</Text></View>)}{achievedMilestones.map((milestone) => <View key={milestone.key} style={s.highlightRow}><Text style={s.highlightIcon}>✧</Text><Text style={s.highlightText}>{milestone.title} · {milestone.detail}</Text></View>)}</View> : null}

    <View style={s.sectionHead}><Text style={s.sectionTitle}>SESSION DETAILS</Text><Pressable accessibilityRole="button" onPress={() => { setEditing((current) => !current); setError(null); }} style={s.editButton}><Text style={s.editText}>{editing ? "DONE" : "EDIT"}</Text></Pressable></View>
    {editing ? <Text style={s.editHint}>Changes save when you finish editing each field. Warm-up sets stay out of records and volume.</Text> : null}
    {workout.exercises.map((exercise) => <View key={exercise.id} style={[s.exerciseCard, exercise.isOmitted && s.omittedCard]}>
      <View style={s.exerciseHead}><View style={s.exerciseCopy}><Text style={s.exerciseName}>{exercise.name}</Text><Text style={s.exerciseMeta}>{exercise.primaryMuscleGroup} · {exercise.equipment}{exercise.targetSetCount ? ` · target ${exercise.targetSetCount} × ${exercise.targetRepMin}–${exercise.targetRepMax}` : ""}</Text>{exercise.isOmitted ? <Text style={s.omitted}>Removed during workout · saved sets retained</Text> : null}</View><Text style={s.setCount}>{exercise.sets.length} sets</Text></View>
      <View style={s.tableHead}><Text style={s.tableLabel}>SET</Text><Text style={s.tableLabel}>{exercise.loadType === "bodyweight" ? "LOAD" : "KG"}</Text><Text style={s.tableLabel}>REPS</Text><Text style={s.tableLabel}>TYPE</Text>{editing ? <Text style={s.tableLabel}>EDIT</Text> : null}</View>
      {exercise.sets.map((set) => <View key={set.id} style={s.setRow}>
        <Text style={s.setIndex}>{set.orderIndex + 1}</Text>
        {editing && set.isCompleted && exercise.loadType !== "bodyweight" ? <SetField value={set.loadKg?.toString() ?? ""} placeholder="—" keyboard="decimal-pad" accessibilityLabel={`Set ${set.orderIndex + 1} load in kilograms`} onCommit={(text) => saveSet(set.id, "load_kg", text)} /> : <Text style={s.setValue}>{set.loadKg === null ? "—" : `${set.loadKg} kg`}</Text>}
        {editing && set.isCompleted ? <SetField value={set.repetitions?.toString() ?? ""} placeholder="reps" keyboard="number-pad" accessibilityLabel={`Set ${set.orderIndex + 1} repetitions`} onCommit={(text) => saveSet(set.id, "repetitions", text)} /> : <Text style={s.setValue}>{set.repetitions ?? "—"}</Text>}
        {editing && set.isCompleted ? <Pressable accessibilityRole="button" onPress={() => void changeSetType(set.id, set.setType)} style={s.typeButton}><Text style={[s.typeText, set.setType === "warm_up" && s.warmType]}>{set.setType === "warm_up" ? "WARM" : "WORK"}</Text></Pressable> : <Text style={[s.typeText, set.setType === "warm_up" && s.warmType]}>{set.setType === "warm_up" ? "WARM-UP" : "WORKING"}</Text>}
        {editing && set.isCompleted ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete set ${set.orderIndex + 1}`} onPress={() => removeSet(set.id)} style={s.removeSet}><Text style={s.removeText}>×</Text></Pressable> : <Text style={s.doneText}>{set.isCompleted ? "COMPLETE" : "NOT COMPLETED"}</Text>}
      </View>)}
      {!exercise.sets.length ? <Text style={s.emptySets}>No set entries were saved for this exercise.</Text> : null}
    </View>)}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <View style={s.bottomActions}><Pressable accessibilityRole="button" onPress={() => setEditing((current) => !current)} style={s.secondaryAction}><Text style={s.secondaryText}>{editing ? "FINISH EDITING" : "EDIT WORKOUT"}</Text></Pressable><Pressable accessibilityRole="button" onPress={removeWorkout} style={s.deleteAction}><Text style={s.deleteText}>DELETE WORKOUT</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>; }

function SetField({ value, placeholder, keyboard, accessibilityLabel, onCommit }: { value: string; placeholder: string; keyboard: "number-pad" | "decimal-pad"; accessibilityLabel: string; onCommit: (text: string) => void }) {
  const [text, setText] = useState(value);
  return <TextInput accessibilityLabel={accessibilityLabel} keyboardType={keyboard} value={text} onChangeText={setText} onEndEditing={() => { if (text !== value) onCommit(text); }} placeholder={placeholder} placeholderTextColor="#77736D" style={s.field} />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, content: { paddingHorizontal: 17, paddingTop: 10, paddingBottom: 30 }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }, wordmark: { color: C.gold, fontFamily: "serif", fontSize: 11, letterSpacing: 2 }, topline: { minHeight: 48, flexDirection: "row", alignItems: "center", marginBottom: 12 }, back: { width: 36, height: 36, borderColor: C.line, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 10 }, backGlyph: { color: C.parchment, fontSize: 25, marginTop: -3 }, topCopy: { flex: 1 }, eyebrow: { color: C.gold, fontSize: 9, letterSpacing: 1.4, marginBottom: 4 }, title: { color: C.text, fontSize: 22, fontFamily: "serif" }, date: { color: C.muted, fontSize: 12, marginBottom: 14 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { width: "48.5%", minHeight: 64, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, justifyContent: "center" }, metricLabel: { color: C.muted, fontSize: 8, letterSpacing: 0.8 }, metricValue: { color: C.text, fontSize: 18, fontWeight: "600", marginTop: 5 }, volume: { marginTop: 9, backgroundColor: "#211E1A", borderWidth: 1, borderColor: "#5C4930", borderRadius: 8, padding: 12 }, volumeLabel: { color: C.gold, fontSize: 8, letterSpacing: 1 }, volumeValue: { color: C.parchment, fontSize: 19, fontWeight: "600", marginTop: 4 }, highlightPanel: { marginTop: 13, padding: 12, backgroundColor: "#211E1A", borderWidth: 1, borderColor: "#725A39", borderRadius: 9 }, sectionTitle: { color: C.parchment, fontFamily: "serif", fontSize: 16 }, highlightRow: { flexDirection: "row", alignItems: "center", marginTop: 9 }, highlightIcon: { color: C.gold, width: 20 }, highlightText: { color: C.text, flex: 1, fontSize: 11, lineHeight: 16 }, sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 10 }, editButton: { minWidth: 62, minHeight: 34, borderWidth: 1, borderColor: C.line, borderRadius: 7, alignItems: "center", justifyContent: "center" }, editText: { color: C.gold, fontSize: 9, fontWeight: "700", letterSpacing: 1 }, editHint: { color: C.muted, fontSize: 10, lineHeight: 15, marginBottom: 9 }, exerciseCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 10, marginBottom: 10 }, omittedCard: { opacity: 0.72 }, exerciseHead: { flexDirection: "row", alignItems: "center", marginBottom: 10 }, exerciseCopy: { flex: 1 }, exerciseName: { color: C.text, fontSize: 13, fontWeight: "600" }, exerciseMeta: { color: C.muted, fontSize: 9, marginTop: 4 }, omitted: { color: C.gold, fontSize: 9, marginTop: 4 }, setCount: { color: C.muted, fontSize: 9 }, tableHead: { minHeight: 28, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: C.line }, tableLabel: { flex: 1, color: C.muted, textAlign: "center", fontSize: 8, letterSpacing: 0.5 }, setRow: { minHeight: 42, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#2D2C2F" }, setIndex: { flex: 1, color: C.muted, textAlign: "center", fontSize: 11 }, setValue: { flex: 1, color: C.parchment, textAlign: "center", fontSize: 11 }, field: { flex: 1, height: 34, borderWidth: 1, borderColor: C.line, borderRadius: 5, color: C.text, backgroundColor: "#121214", marginHorizontal: 3, paddingHorizontal: 2, textAlign: "center", fontSize: 11 }, typeButton: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center" }, typeText: { color: C.green, fontSize: 8, fontWeight: "700", textAlign: "center" }, warmType: { color: C.gold }, doneText: { flex: 1, color: C.green, fontSize: 7, fontWeight: "700", textAlign: "center" }, removeSet: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 34 }, removeText: { color: "#C38272", fontSize: 19 }, emptySets: { color: C.muted, fontSize: 11, paddingVertical: 10 }, bottomActions: { gap: 8, marginTop: 12 }, secondaryAction: { height: 46, borderColor: C.line, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }, secondaryText: { color: C.gold, fontSize: 10, fontWeight: "700", letterSpacing: 1 }, deleteAction: { height: 44, borderColor: "#583B37", borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }, deleteText: { color: "#C38272", fontSize: 9, fontWeight: "700", letterSpacing: 1 }, emptyTitle: { color: C.parchment, fontSize: 18, fontFamily: "serif", marginTop: 15 }, emptyText: { color: C.muted, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 7 }, backToHistory: { marginTop: 16, padding: 13, borderWidth: 1, borderColor: C.line, borderRadius: 8 }, backText: { color: C.gold, fontSize: 10 }, error: { color: "#D88A73", fontSize: 11, marginTop: 12 },
});
