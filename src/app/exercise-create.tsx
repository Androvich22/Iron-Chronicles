import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../components/AtmosphereBackground";
import { getExerciseById } from "../data/workoutRepository";
import { saveCustomExercise } from "../data/exerciseRepository";
import type { ExerciseLoadType, ExerciseTrackingType } from "../data/exerciseCatalog";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };
const LOADS: { key: ExerciseLoadType; label: string }[] = [
  { key: "external", label: "External weight" }, { key: "bodyweight", label: "Bodyweight" }, { key: "bodyweight_added_load", label: "Bodyweight + load" },
];

export default function ExerciseCreateScreen() {
  const db = useSQLiteContext();
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const editingId = typeof exerciseId === "string" ? exerciseId : null;
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [secondary, setSecondary] = useState("");
  const [equipment, setEquipment] = useState("");
  const [loadType, setLoadType] = useState<ExerciseLoadType>("external");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(Boolean(editingId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!editingId) return;
    getExerciseById(db, editingId).then((exercise) => {
      if (!active) return;
      if (!exercise || exercise.source !== "user") { setError("Only custom exercises can be edited here."); return; }
      setName(exercise.name); setMuscle(exercise.primaryMuscleGroup); setSecondary(exercise.secondaryMuscleGroups.join(", "));
      setEquipment(exercise.equipment); setLoadType(exercise.loadType); setInstructions(exercise.instructions ?? "");
    }).catch(() => { if (active) setError("This exercise could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, editingId]);

  const save = async () => {
    setSaving(true); setError(null);
    const trackingType: ExerciseTrackingType = loadType === "external" ? "loaded_reps" : "bodyweight_reps";
    try {
      await saveCustomExercise(db, editingId, { name, primaryMuscleGroup: muscle, secondaryMuscleGroups: secondary.split(",").map((value) => value.trim()).filter(Boolean), equipment, loadType, trackingType, instructions: instructions.trim() || null });
      if (editingId) router.back();
      else router.replace("/(tabs)/library");
    } catch (err) { setError(err instanceof Error ? err.message : "The exercise could not be saved."); }
    finally { setSaving(false); }
  };

  return <SafeAreaView style={s.safe} edges={["top"]}><AtmosphereBackground scene="armory" /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <View style={s.topline}><Pressable onPress={() => router.back()} style={s.back}><Text style={s.backGlyph}>‹</Text></Pressable><Text style={s.wordmark}>THE LIBRARY</Text></View>
    <Text style={s.title}>{editingId ? "Edit exercise" : "New exercise"}</Text><Text style={s.description}>Add a custom movement to your local exercise library.</Text>
    <Field label="EXERCISE NAME" value={name} onChangeText={setName} placeholder="e.g. Zercher Squat" />
    <Field label="PRIMARY MUSCLE GROUP" value={muscle} onChangeText={setMuscle} placeholder="e.g. Quadriceps" />
    <Field label="SECONDARY MUSCLES" value={secondary} onChangeText={setSecondary} placeholder="Comma separated (optional)" />
    <Field label="EQUIPMENT" value={equipment} onChangeText={setEquipment} placeholder="e.g. Barbell" />
    <Text style={s.label}>TRACKING STYLE</Text><View style={s.loadGroup}>{LOADS.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ selected: loadType === item.key }} onPress={() => setLoadType(item.key)} style={[s.loadOption, loadType === item.key && s.loadOptionSelected]}><Text style={[s.loadText, loadType === item.key && s.loadTextSelected]}>{item.label}</Text></Pressable>)}</View>
    <Text style={s.label}>HOW TO PERFORM (OPTIONAL)</Text><TextInput accessibilityLabel="Exercise instructions" multiline value={instructions} onChangeText={setInstructions} placeholder="Short movement cues" placeholderTextColor="#77736D" style={s.instructions} maxLength={500} />
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving || loading} onPress={() => void save()} style={[s.save, (saving || loading) && s.disabled]}><Text style={s.saveText}>{saving ? "SAVING…" : "SAVE EXERCISE"}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (text: string) => void; placeholder: string }) { return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#77736D" style={s.input} maxLength={100} /></View>; }

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, paddingTop: 10, paddingBottom: 30 }, topline: { height: 42, flexDirection: "row", alignItems: "center", marginBottom: 13 }, back: { width: 36, height: 36, borderWidth: 1, borderColor: C.line, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 11 }, backGlyph: { color: C.parchment, fontSize: 25, marginTop: -3 }, wordmark: { color: C.gold, fontFamily: "serif", fontSize: 11, letterSpacing: 2.4 }, title: { color: C.text, fontFamily: "serif", fontSize: 28 }, description: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 13 }, field: { marginTop: 12 }, label: { color: C.gold, fontSize: 9, letterSpacing: 1.2, marginBottom: 7 }, input: { height: 46, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 8, color: C.text, paddingHorizontal: 12, fontSize: 13 }, loadGroup: { gap: 7 }, loadOption: { minHeight: 41, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 7, justifyContent: "center" }, loadOptionSelected: { borderColor: "#806A45", backgroundColor: "#211E1A" }, loadText: { color: C.muted, fontSize: 12 }, loadTextSelected: { color: C.parchment, fontWeight: "600" }, instructions: { minHeight: 100, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 8, color: C.text, padding: 12, fontSize: 13, textAlignVertical: "top" }, error: { color: "#D88A73", marginTop: 13, fontSize: 12 }, save: { height: 50, marginTop: 22, backgroundColor: C.ember, borderWidth: 1, borderColor: "#B2674A", borderRadius: 8, alignItems: "center", justifyContent: "center" }, saveText: { color: "#FFF5E7", fontSize: 11, fontWeight: "700", letterSpacing: 1 }, disabled: { opacity: 0.55 } });
