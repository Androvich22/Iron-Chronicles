import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandMark } from "../../components/BrandMark";
import { getDashboardOverview, type DashboardOverview } from "../../data/dashboardRepository";
import { startOrResumeWorkout } from "../../data/workoutRepository";
import { getPersonalRecords, type PersonalRecord } from "../../data/progressRepository";

const C = { bg: "#101113", panel: "#191A1D", raised: "#242326", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };
const today = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Text style={styles.action}>{action}</Text> : null}</View>;
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricIcon}>{icon}</Text><View><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View></View>;
}

export default function HallScreen() {
  const db = useSQLiteContext();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let current = true;
    Promise.all([getDashboardOverview(db), getPersonalRecords(db)]).then(([result, personalRecords]) => { if (current) { setOverview(result); setRecords(personalRecords.slice(0, 2)); } });
    return () => { current = false; };
  }, [db]));

  const startWorkout = async () => {
    setStarting(true);
    try {
      const workoutId = await startOrResumeWorkout(db);
      router.push({ pathname: "/workout-active", params: { workoutId } });
    } catch {
      setStartError("Could not open a workout. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}><View style={styles.brand}><BrandMark size={25} /><Text style={styles.wordmark}>IRON CHRONICLES</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Settings and data backup" onPress={() => router.push("/settings")} style={styles.settings}><Text style={styles.settingsGlyph}>⚙</Text></Pressable></View>
        <Text style={styles.kicker}>THE HALL  ·  {today}</Text>
        <Text style={styles.greeting}>Your training,{`\n`}written in iron.</Text>
        <Text style={styles.intro}>A clear record of the work you put in.</Text>

        <View style={styles.weekCard}>
          <View style={styles.weekRow}><Text style={styles.weekTitle}>THIS WEEK</Text><Text style={styles.weekCount}>{overview?.workoutsThisWeek ?? "—"} <Text style={styles.weekMuted}>sessions</Text></Text></View>
          <View style={styles.activityMarks}>{[0, 1, 2, 3, 4, 5, 6].map((day) => <View key={day} style={[styles.activityMark, overview?.completedDaysThisWeek.includes(day) && styles.activityMarkDone]} />)}</View>
          <Text style={styles.weekHint}>A new page is waiting to be written.</Text>
        </View>

        <Pressable accessibilityRole="button" disabled={starting} onPress={() => void startWorkout()} style={({ pressed }) => [styles.primary, pressed && styles.pressed, starting && styles.pressed]}>
          <Text style={styles.primaryIcon}>⚒</Text><Text style={styles.primaryText}>{starting ? "OPENING SESSION…" : "START WORKOUT"}</Text><Text style={styles.primaryArrow}>›</Text>
        </Pressable>
        {startError ? <Text accessibilityRole="alert" style={styles.startError}>{startError}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => router.push("/routine-editor")} style={styles.secondary}><Text style={styles.secondaryIcon}>＋</Text><Text style={styles.secondaryText}>Create a routine</Text><Text style={styles.chevron}>›</Text></Pressable>

        <SectionTitle title="YOUR RECORD" />
        <View style={styles.metricsGrid}>
          <Metric icon="♜" label="COMPLETED WORKOUTS" value={overview?.completedWorkouts.toLocaleString() ?? "—"} />
          <Metric icon="⚖" label="RECORDED VOLUME" value={overview ? `${overview.recordedVolumeKg.toLocaleString()} kg` : "—"} />
          <Metric icon="◇" label="MOVEMENTS LOGGED" value={overview?.distinctMovements.toLocaleString() ?? "—"} />
          <Metric icon="▦" label="THIS MONTH" value={overview ? `${overview.workoutsThisMonth} sessions` : "—"} />
        </View>

        <SectionTitle title="RECENT RECORDS" action="THE CHRONICLE  ›" />
        {records.length ? records.map((record) => <Pressable key={record.key} onPress={() => router.push("/progress")} style={styles.recordRow}><View style={styles.recordSeal}><Text style={styles.recordGlyph}>✧</Text></View><View style={styles.recordCopy}><Text style={styles.recordName}>{record.exerciseName}</Text><Text style={styles.recordMeta}>{record.title}</Text></View><Text style={styles.recordValue}>{record.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} {record.unit}</Text></Pressable>) : <Pressable onPress={() => router.push("/progress")} style={styles.recordEmpty}><Text style={styles.recordEmptyText}>Your first personal record will appear here.</Text><Text style={styles.chevron}>›</Text></Pressable>}

        <SectionTitle title="RECENT WORKOUTS" action="HISTORY  ›" />
        {overview?.recentWorkouts.length ? overview.recentWorkouts.map((workout) => {
          const minutes = Math.max(0, Math.floor((new Date(workout.completedAt).getTime() - new Date(workout.startedAt).getTime()) / 60000));
          return <Pressable key={workout.id} onPress={() => router.push({ pathname: "/workout/[id]", params: { id: workout.id } })} style={styles.emptyCard}><View style={styles.emptySeal}><Text style={styles.emptyGlyph}>⚒</Text></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>Workout</Text><Text style={styles.emptyText}>{new Date(workout.completedAt).toLocaleDateString()} · {minutes} min · {workout.exerciseCount} exercises · {workout.setCount} sets</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
        }) : <View style={styles.emptyCard}><View style={styles.emptySeal}><Text style={styles.emptyGlyph}>⚒</Text></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>{overview ? "Your first entry begins here" : "Opening your record…"}</Text><Text style={styles.emptyText}>{overview ? "Completed workouts will be kept in your chronicle." : "Your local training summary is loading."}</Text></View></View>}

        <View style={styles.footer}><View style={styles.footerRule} /><Text style={styles.footerMark}>✦</Text><Text style={styles.footerText}>TRAIN WITH PURPOSE · KEEP THE RECORD</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  topline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }, brand: { flexDirection: "row", alignItems: "center", gap: 9 }, wordmark: { color: C.gold, fontSize: 13, letterSpacing: 3.2, fontFamily: "serif" }, settings: { width: 40, height: 40, borderRadius: 20, borderColor: C.line, borderWidth: 1, alignItems: "center", justifyContent: "center" }, settingsGlyph: { fontSize: 19, color: C.parchment },
  kicker: { color: C.gold, fontSize: 10, letterSpacing: 2.3, marginBottom: 11, fontWeight: "600" }, greeting: { fontFamily: "serif", fontSize: 32, lineHeight: 38, color: C.text }, intro: { color: C.muted, marginTop: 8, fontSize: 14 },
  weekCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 16, marginTop: 23 }, weekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, weekTitle: { color: C.parchment, fontSize: 11, letterSpacing: 1.5, fontWeight: "600" }, weekCount: { color: C.gold, fontSize: 13, fontWeight: "700" }, weekMuted: { color: C.muted, fontWeight: "400" }, activityMarks: { flexDirection: "row", gap: 7, marginTop: 15 }, activityMark: { flex: 1, height: 5, borderRadius: 3, backgroundColor: C.raised }, weekHint: { color: C.muted, fontSize: 12, marginTop: 10 },
  primary: { height: 56, backgroundColor: C.ember, borderRadius: 10, marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B2674A" }, pressed: { opacity: 0.8 }, primaryIcon: { color: "#F5D49B", fontSize: 17, marginRight: 10 }, primaryText: { color: "#FFF5E7", letterSpacing: 1.4, fontSize: 13, fontWeight: "700" }, primaryArrow: { color: "#F5D49B", fontSize: 23, position: "absolute", right: 18 },
  startError: { color: "#D88A73", fontSize: 12, marginTop: 7 },
  secondary: { height: 48, flexDirection: "row", alignItems: "center", marginTop: 8, paddingHorizontal: 12, backgroundColor: "#151518", borderColor: C.line, borderWidth: 1, borderRadius: 9 }, secondaryIcon: { color: C.gold, fontSize: 19, marginRight: 10 }, secondaryText: { color: C.parchment, fontSize: 13, flex: 1 }, chevron: { color: C.gold, fontSize: 20 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 }, sectionTitle: { fontFamily: "serif", color: C.parchment, fontSize: 17, letterSpacing: 0.4 }, action: { color: C.gold, fontSize: 10, letterSpacing: 1.1, fontWeight: "600" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, metric: { width: "48.5%", minHeight: 76, borderColor: C.line, borderWidth: 1, borderRadius: 10, backgroundColor: C.panel, padding: 12, flexDirection: "row", alignItems: "center" }, metricIcon: { color: C.gold, fontSize: 19, width: 31 }, metricLabel: { color: C.muted, fontSize: 9, letterSpacing: 0.65 }, metricValue: { color: C.text, fontSize: 17, marginTop: 4, fontWeight: "600" },
  activityMarkDone: { backgroundColor: C.ember }, recordRow: { minHeight: 61, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 9, marginBottom: 7 }, recordSeal: { width: 38, height: 38, borderRadius: 20, borderWidth: 1, borderColor: "#514633", justifyContent: "center", alignItems: "center", marginRight: 10 }, recordGlyph: { color: C.gold, fontSize: 16 }, recordCopy: { flex: 1 }, recordName: { color: C.text, fontSize: 11, fontWeight: "600" }, recordMeta: { color: C.muted, fontSize: 9, marginTop: 4 }, recordValue: { color: C.gold, fontSize: 10, fontWeight: "700" }, recordEmpty: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, borderColor: C.line, borderWidth: 1, borderRadius: 9, backgroundColor: C.panel }, recordEmptyText: { flex: 1, color: C.muted, fontSize: 11 }, emptyCard: { minHeight: 88, flexDirection: "row", alignItems: "center", padding: 14, borderColor: C.line, borderWidth: 1, borderRadius: 10, backgroundColor: C.panel, marginBottom: 8 }, emptySeal: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: "#6B583A", justifyContent: "center", alignItems: "center", marginRight: 12 }, emptyGlyph: { color: C.gold, fontSize: 19 }, emptyCopy: { flex: 1 }, emptyTitle: { color: C.text, fontSize: 13, fontWeight: "600" }, emptyText: { color: C.muted, fontSize: 11, marginTop: 5, lineHeight: 16 },
  footer: { alignItems: "center", marginTop: 29 }, footerRule: { height: 1, width: "100%", backgroundColor: C.line }, footerMark: { color: C.gold, marginTop: -9, backgroundColor: C.bg, paddingHorizontal: 9, fontSize: 14 }, footerText: { color: "#716C65", fontSize: 9, letterSpacing: 1.6, marginTop: 6 },
});
