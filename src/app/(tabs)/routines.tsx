import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../../components/AtmosphereBackground";
import { deleteRoutine, duplicateRoutine, listRoutines, type Routine } from "../../data/routineRepository";
import { startWorkoutFromRoutine } from "../../data/workoutRepository";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };

export default function RoutinesScreen() {
  const db = useSQLiteContext();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filteredRoutines = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? routines.filter((routine) => `${routine.name} ${routine.notes ?? ""}`.toLocaleLowerCase().includes(needle)) : routines;
  }, [routines, query]);
  const refresh = useCallback(async () => {
    try { setRoutines(await listRoutines(db)); setError(null); }
    catch { setError("Your routines could not be loaded. Please try again."); }
    finally { setLoading(false); }
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const begin = async (routine: Routine) => {
    setBusyId(routine.id);
    try {
      const workoutId = await startWorkoutFromRoutine(db, routine.id);
      router.push({ pathname: "/workout-active", params: { workoutId } });
    } catch (err) { Alert.alert("Could not start routine", err instanceof Error ? err.message : "Please try again."); }
    finally { setBusyId(null); }
  };
  const remove = (routine: Routine) => Alert.alert("Delete routine?", `“${routine.name}” will be removed. Completed and active workout records will stay unchanged.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => { void deleteRoutine(db, routine.id).then(refresh).catch(() => setError("This routine could not be deleted.")); } },
  ]);
  const duplicate = async (routine: Routine) => {
    try { const id = await duplicateRoutine(db, routine.id); await refresh(); router.push({ pathname: "/routine-editor", params: { routineId: id } }); }
    catch { setError("This routine could not be duplicated."); }
  };

  return <SafeAreaView style={s.safe} edges={["top"]}><AtmosphereBackground scene="armory" />
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.wordmark}>IRON CHRONICLES</Text><Text style={s.eyebrow}>THE ARMORY</Text><Text style={s.title}>Routines</Text>
      <Text style={s.description}>Keep your training plans ready, ordered, and easy to follow.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push("/routine-editor")} style={s.primary}><Text style={s.primaryGlyph}>＋</Text><Text style={s.primaryText}>CREATE ROUTINE</Text></Pressable>
      <Text style={s.sectionTitle}>{routines.length ? "YOUR ROUTINES" : "READY WHEN YOU ARE"}</Text>
      {routines.length ? <TextInput accessibilityLabel="Search routines" value={query} onChangeText={setQuery} placeholder="Search routines or notes" placeholderTextColor="#77736D" style={s.search} returnKeyType="search" /> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {!loading && routines.length === 0 ? <View style={s.empty}><View style={s.seal}><Text style={s.sealGlyph}>✦</Text></View><Text style={s.emptyTitle}>No routines yet</Text><Text style={s.emptyText}>Build a plan from your exercise library, then start a workout from it whenever you train.</Text><Pressable onPress={() => router.push("/library")} style={s.browse}><Text style={s.browseText}>BROWSE EXERCISES</Text></Pressable></View> : null}
      {routines.length > 0 && filteredRoutines.length === 0 ? <View style={s.noMatches}><Text style={s.emptyTitle}>No matching routines</Text><Text style={s.emptyText}>Try another routine name or note.</Text></View> : null}
      {filteredRoutines.map((routine) => <View key={routine.id} style={s.card}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/routine-editor", params: { routineId: routine.id } })} style={s.cardHead}>
          <View style={s.cardSeal}><Text style={s.cardGlyph}>⚒</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{routine.name}</Text><Text style={s.cardMeta}>{routine.exerciseCount} {routine.exerciseCount === 1 ? "exercise" : "exercises"}{routine.notes ? `  ·  ${routine.notes}` : ""}</Text></View><Text style={s.chevron}>›</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busyId === routine.id} onPress={() => void begin(routine)} style={s.start}><Text style={s.startText}>{busyId === routine.id ? "OPENING…" : "START THIS ROUTINE"}</Text></Pressable>
        <View style={s.actions}><Pressable accessibilityRole="button" onPress={() => void duplicate(routine)} style={s.action}><Text style={s.actionText}>DUPLICATE</Text></Pressable><View style={s.actionRule} /><Pressable accessibilityRole="button" onPress={() => remove(routine)} style={s.action}><Text style={s.deleteText}>DELETE</Text></Pressable></View>
      </View>)}
      {loading ? <Text style={s.loading}>Opening your saved plans…</Text> : null}
      <Text style={s.note}>Targets guide the session. Actual workout entries are saved separately from the routine.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, paddingTop: 18, paddingBottom: 32 }, wordmark: { color: C.gold, fontSize: 12, letterSpacing: 3, fontFamily: "serif", marginBottom: 31 }, eyebrow: { color: C.gold, fontSize: 10, letterSpacing: 2, marginBottom: 9 }, title: { color: C.text, fontSize: 31, fontFamily: "serif" }, description: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 8 }, primary: { height: 52, backgroundColor: C.ember, borderRadius: 9, marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B2674A" }, primaryGlyph: { color: "#F5D49B", fontSize: 20, marginRight: 10 }, primaryText: { color: "#FFF5E7", fontSize: 12, fontWeight: "700", letterSpacing: 1 }, sectionTitle: { color: C.parchment, fontFamily: "serif", fontSize: 17, marginTop: 29, marginBottom: 12 }, search: { height: 44, borderColor: C.line, borderWidth: 1, backgroundColor: C.panel, borderRadius: 8, color: C.text, paddingHorizontal: 12, fontSize: 12, marginBottom: 12 }, noMatches: { alignItems: "center", backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 9, padding: 22, marginBottom: 10 }, card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 11, padding: 12, marginBottom: 10 }, cardHead: { minHeight: 57, flexDirection: "row", alignItems: "center" }, cardSeal: { width: 43, height: 43, borderColor: "#514633", borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 11 }, cardGlyph: { color: C.gold, fontSize: 18 }, cardCopy: { flex: 1 }, cardTitle: { color: C.text, fontSize: 15, fontFamily: "serif" }, cardMeta: { color: C.muted, fontSize: 10, marginTop: 5 }, chevron: { color: C.gold, fontSize: 22, paddingHorizontal: 4 }, start: { height: 42, marginTop: 9, backgroundColor: "#25211B", borderRadius: 7, borderWidth: 1, borderColor: "#5C4930", alignItems: "center", justifyContent: "center" }, startText: { color: C.gold, fontSize: 10, fontWeight: "700", letterSpacing: 1 }, actions: { flexDirection: "row", alignItems: "center", height: 39, marginTop: 3 }, action: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 38 }, actionText: { color: C.muted, fontSize: 9, letterSpacing: 1, fontWeight: "600" }, deleteText: { color: "#B97868", fontSize: 9, letterSpacing: 1, fontWeight: "600" }, actionRule: { height: 15, width: 1, backgroundColor: C.line }, empty: { alignItems: "center", backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 11, padding: 22 }, seal: { height: 48, width: 48, borderRadius: 24, borderWidth: 1, borderColor: "#6B583A", justifyContent: "center", alignItems: "center", marginBottom: 13 }, sealGlyph: { color: C.gold, fontSize: 19 }, emptyTitle: { color: C.parchment, fontFamily: "serif", fontSize: 17 }, emptyText: { color: C.muted, fontSize: 12, marginTop: 7, lineHeight: 18, textAlign: "center" }, browse: { paddingHorizontal: 16, paddingVertical: 11, marginTop: 16, borderRadius: 7, borderColor: C.line, borderWidth: 1 }, browseText: { color: C.gold, fontSize: 10, letterSpacing: 1 }, error: { color: "#D88A73", fontSize: 12, marginBottom: 10 }, loading: { color: C.muted, fontSize: 12, padding: 18, textAlign: "center" }, note: { color: "#77726B", fontSize: 10, lineHeight: 15, marginTop: 18, textAlign: "center" } });
