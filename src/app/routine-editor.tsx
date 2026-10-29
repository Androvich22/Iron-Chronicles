import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../components/AtmosphereBackground";
import { getExerciseArtwork } from "../data/exerciseArtwork";
import { searchExercises, type Exercise } from "../data/exerciseRepository";
import { getRoutine, saveRoutine, type RoutineExerciseInput } from "../data/routineRepository";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };
type DraftExercise = RoutineExerciseInput & { name: string; muscle: string; equipment: string };
const initialExercise = (exercise: Exercise): DraftExercise => ({ exerciseId: exercise.id, name: exercise.name, muscle: exercise.primaryMuscleGroup, equipment: exercise.equipment, targetSetCount: 3, targetRepMin: 8, targetRepMax: 12, targetLoadKg: null, restSeconds: 90, note: null });

export default function RoutineEditorScreen() {
  const db = useSQLiteContext();
  const { routineId } = useLocalSearchParams<{ routineId?: string }>();
  const editingId = typeof routineId === "string" ? routineId : null;
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftExercise[]>([]);
  const [query, setQuery] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(Boolean(editingId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!editingId) return;
    getRoutine(db, editingId).then((routine) => {
      if (!active) return;
      if (!routine) { setError("This routine could not be found."); return; }
      setName(routine.name); setNotes(routine.notes ?? "");
      setItems(routine.exercises.map((item) => ({ exerciseId: item.exerciseId, name: item.exercise.name, muscle: item.exercise.primaryMuscleGroup, equipment: item.exercise.equipment, targetSetCount: item.targetSetCount, targetRepMin: item.targetRepMin, targetRepMax: item.targetRepMax, targetLoadKg: item.targetLoadKg, restSeconds: item.restSeconds, note: item.note })));
    }).catch(() => { if (active) setError("This routine could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, editingId]);

  useEffect(() => {
    let active = true;
    searchExercises(db, query).then((result) => { if (active) setExercises(result.slice(0, 30)); }).catch(() => { if (active) setExercises([]); });
    return () => { active = false; };
  }, [db, query]);

  const available = useMemo(() => exercises.filter((exercise) => !items.some((item) => item.exerciseId === exercise.id)), [exercises, items]);
  const add = (exercise: Exercise) => { Keyboard.dismiss(); setItems((current) => [...current, initialExercise(exercise)]); setQuery(""); };
  const update = (index: number, patch: Partial<DraftExercise>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const move = (index: number, delta: number) => setItems((current) => { const destination = index + delta; if (destination < 0 || destination >= current.length) return current; const next = [...current]; [next[index], next[destination]] = [next[destination], next[index]]; return next; });
  const save = async () => {
    setSaving(true); setError(null);
    try {
      await saveRoutine(db, editingId, name, notes, items.map(({ exerciseId, targetSetCount, targetRepMin, targetRepMax, targetLoadKg, restSeconds, note }) => ({ exerciseId, targetSetCount, targetRepMin, targetRepMax, targetLoadKg, restSeconds, note })));
      router.replace("/(tabs)/routines");
    } catch (err) { setError(err instanceof Error ? err.message : "The routine could not be saved."); }
    finally { setSaving(false); }
  };

  return <SafeAreaView style={s.safe} edges={["top"]}><AtmosphereBackground /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <View style={s.topline}><Pressable onPress={() => router.back()} style={s.back}><Text style={s.backGlyph}>‹</Text></Pressable><Text style={s.wordmark}>THE ARMORY</Text></View>
    <Text style={s.title}>{editingId ? "Edit routine" : "New routine"}</Text><Text style={s.description}>Choose exercises, set their order, and save the targets you want to follow.</Text>
    <Text style={s.label}>ROUTINE NAME</Text><TextInput accessibilityLabel="Routine name" value={name} onChangeText={setName} placeholder="e.g. Upper Body A" placeholderTextColor="#77736D" style={s.input} maxLength={60} />
    <Text style={s.label}>NOTES (OPTIONAL)</Text><TextInput accessibilityLabel="Routine notes" value={notes} onChangeText={setNotes} placeholder="A short reminder for this plan" placeholderTextColor="#77736D" style={[s.input, s.notes]} multiline maxLength={240} />

    <View style={s.sectionHead}><Text style={s.sectionTitle}>EXERCISES</Text><Text style={s.count}>{items.length}</Text></View>
    {items.map((item, index) => <View key={item.exerciseId} style={s.exerciseCard}>
      <View style={s.exerciseHead}><Image source={getExerciseArtwork(item.exerciseId)} style={s.thumb} resizeMode="cover" /><View style={s.exerciseCopy}><Text style={s.exerciseName}>{item.name}</Text><Text style={s.exerciseMeta}>{item.muscle} · {item.equipment}</Text></View><View style={s.orderButtons}><Pressable accessibilityRole="button" accessibilityLabel={`Move ${item.name} up`} onPress={() => move(index, -1)} style={s.orderButton}><Text style={s.orderGlyph}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Move ${item.name} down`} onPress={() => move(index, 1)} style={s.orderButton}><Text style={s.orderGlyph}>↓</Text></Pressable></View></View>
      <View style={s.targetRow}><Target label="SETS" value={String(item.targetSetCount)} onChange={(text) => update(index, { targetSetCount: Number(text) || 0 })} /><Target label="REP MIN" value={String(item.targetRepMin)} onChange={(text) => update(index, { targetRepMin: Number(text) || 0 })} /><Target label="REP MAX" value={String(item.targetRepMax)} onChange={(text) => update(index, { targetRepMax: Number(text) || 0 })} /></View>
      <View style={s.targetRow}><Target label="LOAD KG (OPTIONAL)" value={item.targetLoadKg === null ? "" : String(item.targetLoadKg)} placeholder="—" decimal onChange={(text) => update(index, { targetLoadKg: text.trim() ? Number(text) : null })} /><Target label="REST SEC" value={item.restSeconds === null ? "" : String(item.restSeconds)} placeholder="90" onChange={(text) => update(index, { restSeconds: text.trim() ? Number(text) || 0 : null })} /><Pressable accessibilityRole="button" onPress={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={s.remove}><Text style={s.removeText}>REMOVE</Text></Pressable></View>
      <TextInput accessibilityLabel={`Note for ${item.name}`} value={item.note ?? ""} onChangeText={(text) => update(index, { note: text || null })} placeholder="Exercise note (optional)" placeholderTextColor="#77736D" style={s.noteInput} maxLength={160} />
    </View>)}

    <Text style={s.sectionTitle}>ADD FROM THE LIBRARY</Text><TextInput accessibilityLabel="Search exercises to add" value={query} onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor="#77736D" style={s.input} returnKeyType="search" />
    {available.slice(0, 12).map((exercise) => <Pressable key={exercise.id} onPress={() => add(exercise)} style={s.match}><Image source={getExerciseArtwork(exercise.id)} style={s.matchImage} resizeMode="cover" /><View style={s.matchCopy}><Text style={s.matchName}>{exercise.name}</Text><Text style={s.matchMeta}>{exercise.primaryMuscleGroup} · {exercise.equipment}</Text></View><Text style={s.addGlyph}>＋</Text></Pressable>)}
    {!loading && available.length === 0 ? <Text style={s.empty}>{query ? "No matching exercises." : "All matching exercises are already in this routine."}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving || loading} onPress={() => void save()} style={[s.save, (saving || loading) && s.disabled]}><Text style={s.saveText}>{saving ? "SAVING…" : "SAVE ROUTINE"}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

function Target({ label, value, placeholder, decimal, onChange }: { label: string; value: string; placeholder?: string; decimal?: boolean; onChange: (text: string) => void }) { return <View style={s.target}><Text style={s.targetLabel}>{label}</Text><TextInput accessibilityLabel={label} keyboardType={decimal ? "decimal-pad" : "number-pad"} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#77736D" style={s.targetInput} /></View>; }

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 30 }, topline: { height: 42, flexDirection: "row", alignItems: "center", marginBottom: 13 }, back: { width: 36, height: 36, borderWidth: 1, borderColor: C.line, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 11 }, backGlyph: { color: C.parchment, fontSize: 25, marginTop: -3 }, wordmark: { color: C.gold, fontFamily: "serif", fontSize: 11, letterSpacing: 2.4 }, title: { color: C.text, fontFamily: "serif", fontSize: 28 }, description: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 20 }, label: { color: C.gold, fontSize: 9, letterSpacing: 1.2, marginBottom: 7, marginTop: 13 }, input: { minHeight: 44, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 8, color: C.text, paddingHorizontal: 12, fontSize: 13 }, notes: { minHeight: 72, textAlignVertical: "top", paddingTop: 11 }, sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 11 }, sectionTitle: { color: C.parchment, fontFamily: "serif", fontSize: 17, marginTop: 20, marginBottom: 10 }, count: { color: C.gold, fontSize: 12 }, exerciseCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 10, marginBottom: 10 }, exerciseHead: { flexDirection: "row", alignItems: "center", minHeight: 48 }, thumb: { width: 42, height: 42, borderRadius: 7, marginRight: 9 }, exerciseCopy: { flex: 1 }, exerciseName: { color: C.text, fontSize: 12, fontWeight: "600" }, exerciseMeta: { color: C.muted, fontSize: 9, marginTop: 4 }, orderButtons: { flexDirection: "row", gap: 4 }, orderButton: { width: 30, height: 30, borderWidth: 1, borderColor: C.line, borderRadius: 6, alignItems: "center", justifyContent: "center" }, orderGlyph: { color: C.gold, fontSize: 16 }, targetRow: { flexDirection: "row", gap: 7, marginTop: 10 }, target: { flex: 1 }, targetLabel: { color: C.muted, fontSize: 8, letterSpacing: 0.5, marginBottom: 5 }, targetInput: { height: 36, textAlign: "center", borderWidth: 1, borderColor: C.line, borderRadius: 6, backgroundColor: "#121214", color: C.text, paddingHorizontal: 4, fontSize: 12 }, remove: { flex: 1, alignSelf: "flex-end", height: 36, alignItems: "center", justifyContent: "center" }, removeText: { color: "#B97868", fontSize: 9, letterSpacing: 0.8, fontWeight: "600" }, noteInput: { height: 37, marginTop: 9, borderWidth: 1, borderColor: C.line, borderRadius: 6, backgroundColor: "#121214", color: C.text, paddingHorizontal: 10, fontSize: 11 }, match: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 4 }, matchImage: { width: 40, height: 40, borderRadius: 7, marginRight: 10 }, matchCopy: { flex: 1 }, matchName: { color: C.text, fontSize: 12, fontWeight: "600" }, matchMeta: { color: C.muted, fontSize: 10, marginTop: 3 }, addGlyph: { color: C.gold, fontSize: 20, paddingHorizontal: 5 }, empty: { color: C.muted, fontSize: 11, textAlign: "center", padding: 15 }, error: { color: "#D88A73", marginTop: 12, fontSize: 12 }, save: { height: 50, marginTop: 20, backgroundColor: C.ember, borderWidth: 1, borderColor: "#B2674A", borderRadius: 8, alignItems: "center", justifyContent: "center" }, saveText: { color: "#FFF5E7", fontSize: 11, fontWeight: "700", letterSpacing: 1 }, disabled: { opacity: 0.55 } });
