import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../../components/AtmosphereBackground";
import { getActiveWorkout, listWorkoutHistory, startOrResumeWorkout } from "../../data/workoutRepository";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };
type Active = Awaited<ReturnType<typeof getActiveWorkout>>;
type History = Awaited<ReturnType<typeof listWorkoutHistory>>;

export default function WorkoutsScreen() {
  const db = useSQLiteContext();
  const [active, setActive] = useState<Active>(null);
  const [history, setHistory] = useState<History>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<"all" | "4weeks">("all");
  const [fourWeekCutoff, setFourWeekCutoff] = useState<number | null>(null);
  const visibleHistory = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const cutoff = period === "4weeks" ? fourWeekCutoff : null;
    return history.filter((workout) => {
      const date = new Date(workout.completed_at);
      const matchesQuery = !needle || `${workout.routine_name_snapshot ?? "Empty workout"} ${date.toLocaleDateString()}`.toLocaleLowerCase().includes(needle);
      return matchesQuery && (cutoff === null || date.getTime() >= cutoff);
    });
  }, [fourWeekCutoff, history, period, query]);

  useFocusEffect(useCallback(() => {
    let current = true;
    Promise.all([getActiveWorkout(db), listWorkoutHistory(db)]).then(([activeWorkout, pastWorkouts]) => {
      if (current) { setActive(activeWorkout); setHistory(pastWorkouts); setLoading(false); }
    }).catch(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [db]));

  const openWorkout = async () => {
    setBusy(true);
    try {
      const workoutId = await startOrResumeWorkout(db);
      router.push({ pathname: "/workout-active", params: { workoutId } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AtmosphereBackground />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark}>IRON CHRONICLES</Text>
        <Text style={styles.eyebrow}>THE FORGE</Text>
        <Text style={styles.title}>Workouts</Text>
        <Text style={styles.description}>Log each set as you train. Your active session is kept on this device.</Text>

        {active ? <Pressable onPress={openWorkout} style={styles.resume}><View style={styles.statusDot} /><View style={styles.resumeCopy}><Text style={styles.resumeTitle}>Workout in progress</Text><Text style={styles.resumeSubtitle}>Started {new Date(active.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · saved automatically</Text></View><Text style={styles.arrow}>›</Text></Pressable> : null}

        <Pressable accessibilityRole="button" disabled={busy} onPress={openWorkout} style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy && styles.disabled]}>
          <Text style={styles.primaryIcon}>⚒</Text><Text style={styles.primaryText}>{active ? "RESUME WORKOUT" : "START EMPTY WORKOUT"}</Text><Text style={styles.primaryArrow}>›</Text>
        </Pressable>
        <Text style={styles.helper}>{loading ? "Loading your record…" : "Start without a routine. Add movements as you go."}</Text>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>WORKOUT HISTORY</Text><Text style={styles.count}>{visibleHistory.length}</Text></View>
        <TextInput accessibilityLabel="Search workout history" value={query} onChangeText={setQuery} placeholder="Search routine name or date" placeholderTextColor="#77736D" style={styles.search} />
        <View style={styles.filters}><Pressable onPress={() => { setPeriod("all"); setFourWeekCutoff(null); }} style={[styles.filter, period === "all" && styles.filterActive]}><Text style={[styles.filterText, period === "all" && styles.filterTextActive]}>ALL TIME</Text></Pressable><Pressable onPress={() => { setFourWeekCutoff(Date.now() - 28 * 24 * 60 * 60 * 1000); setPeriod("4weeks"); }} style={[styles.filter, period === "4weeks" && styles.filterActive]}><Text style={[styles.filterText, period === "4weeks" && styles.filterTextActive]}>LAST 4 WEEKS</Text></Pressable></View>
        {history.length === 0 ? <View style={styles.empty}><View style={styles.seal}><Text style={styles.sealGlyph}>✦</Text></View><Text style={styles.emptyTitle}>No completed sessions yet</Text><Text style={styles.emptyText}>Finish a workout and it will be recorded here.</Text></View> : visibleHistory.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No matching workouts</Text><Text style={styles.emptyText}>Try a different routine name, date, or time range.</Text></View> : visibleHistory.map((workout) => (
          <Pressable accessibilityRole="button" key={workout.id} onPress={() => router.push({ pathname: "/workout/[id]", params: { id: workout.id } })} style={styles.historyRow}>
            <View style={styles.historyIcon}><Text style={styles.historyGlyph}>⚒</Text></View>
            <View style={styles.historyCopy}><Text style={styles.historyTitle}>{workout.routine_name_snapshot ?? "Empty workout"}</Text><Text style={styles.historyMeta}>{new Date(workout.completed_at).toLocaleDateString()} · {workout.exercise_count} exercises · {workout.completed_set_count} sets</Text></View><Text style={styles.historyArrow}>›</Text>
          </Pressable>
        ))}
        <Text style={styles.note}>Warm-up and working sets are both saved in the session record.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, paddingTop: 18, paddingBottom: 32 }, wordmark: { color: C.gold, fontSize: 12, letterSpacing: 3, fontFamily: "serif", marginBottom: 31 }, eyebrow: { color: C.gold, fontSize: 10, letterSpacing: 2, marginBottom: 9 }, title: { color: C.text, fontSize: 31, fontFamily: "serif" }, description: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  primary: { height: 56, backgroundColor: C.ember, borderRadius: 10, marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B2674A" }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.6 }, primaryIcon: { color: "#F5D49B", fontSize: 17, marginRight: 10 }, primaryText: { color: "#FFF5E7", letterSpacing: 1.2, fontSize: 12, fontWeight: "700" }, primaryArrow: { color: "#F5D49B", fontSize: 23, position: "absolute", right: 18 }, helper: { color: C.muted, fontSize: 11, textAlign: "center", marginTop: 9 },
  resume: { minHeight: 72, borderColor: "#725A39", borderWidth: 1, borderRadius: 10, backgroundColor: "#211E1A", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", marginTop: 18 }, statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.gold, marginRight: 12 }, resumeCopy: { flex: 1 }, resumeTitle: { color: C.parchment, fontSize: 13, fontWeight: "600" }, resumeSubtitle: { color: C.muted, fontSize: 11, marginTop: 5 }, arrow: { color: C.gold, fontSize: 22 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 32, marginBottom: 12 }, sectionTitle: { color: C.parchment, fontFamily: "serif", fontSize: 17 }, count: { color: C.gold, fontSize: 12 }, search: { height: 45, borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: C.panel, color: C.text, paddingHorizontal: 12, fontSize: 12 }, filters: { flexDirection: "row", gap: 8, marginTop: 9, marginBottom: 11 }, filter: { minHeight: 31, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" }, filterActive: { borderColor: "#806A45", backgroundColor: "#211E1A" }, filterText: { color: C.muted, fontSize: 8, letterSpacing: 0.7 }, filterTextActive: { color: C.gold }, empty: { alignItems: "center", backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 11, padding: 22 }, seal: { height: 48, width: 48, borderRadius: 24, borderWidth: 1, borderColor: "#6B583A", justifyContent: "center", alignItems: "center", marginBottom: 13 }, sealGlyph: { color: C.gold, fontSize: 19 }, emptyTitle: { color: C.parchment, fontFamily: "serif", fontSize: 17 }, emptyText: { color: C.muted, fontSize: 12, marginTop: 6, textAlign: "center" },
  historyRow: { minHeight: 72, flexDirection: "row", alignItems: "center", backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 9, padding: 11, marginBottom: 8 }, historyIcon: { width: 42, height: 42, borderColor: "#514633", borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", marginRight: 11 }, historyGlyph: { color: C.gold }, historyCopy: { flex: 1 }, historyTitle: { color: C.text, fontSize: 13, fontWeight: "600" }, historyMeta: { color: C.muted, fontSize: 10, marginTop: 6 }, historyArrow: { color: C.gold, fontSize: 22, paddingHorizontal: 4 }, note: { color: "#77726B", fontSize: 11, lineHeight: 17, marginTop: 22 },
});
