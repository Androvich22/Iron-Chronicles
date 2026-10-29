import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../../components/AtmosphereBackground";
import { getActivityBuckets, getExerciseTimeline, getPersonalRecords, getProgressSummary, getTrainingMilestones, listProgressExercises, recalculateAchievements, type ActivityBucket, type ExerciseProgressPoint, type PersonalRecord, type ProgressExercise, type ProgressPeriod, type TrainingMilestone } from "../../data/progressRepository";

const C = { bg: "#101113", panel: "#191A1D", raised: "#242326", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };

type Summary = Awaited<ReturnType<typeof getProgressSummary>>;

export default function ProgressScreen() {
  const db = useSQLiteContext();
  const [period, setPeriod] = useState<ProgressPeriod>("weeks");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [buckets, setBuckets] = useState<ActivityBucket[]>([]);
  const [exercises, setExercises] = useState<ProgressExercise[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [milestones, setMilestones] = useState<TrainingMilestone[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [timeline, setTimeline] = useState<ExerciseProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        await recalculateAchievements(db);
        const [nextSummary, nextExercises, nextRecords, nextMilestones, nextBuckets] = await Promise.all([
          getProgressSummary(db), listProgressExercises(db), getPersonalRecords(db), getTrainingMilestones(db), getActivityBuckets(db, period),
        ]);
        if (!active) return;
        setSummary(nextSummary); setExercises(nextExercises); setRecords(nextRecords); setMilestones(nextMilestones); setBuckets(nextBuckets);
        setSelectedKey((current) => current || nextExercises[0]?.key || ""); setError(null);
      } catch { if (active) setError("Progress could not be loaded from your workout history."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [db, period]));

  const filteredExercises = useMemo(() => {
    const query = exerciseQuery.trim().toLocaleLowerCase();
    return exercises.filter((exercise) => !query || `${exercise.name} ${exercise.muscle} ${exercise.equipment}`.toLocaleLowerCase().includes(query));
  }, [exercises, exerciseQuery]);
  const selectedExercise = exercises.find((exercise) => exercise.key === selectedKey) ?? filteredExercises[0] ?? null;

  useEffect(() => {
    let active = true;
    if (!selectedExercise) return () => { active = false; };
    getExerciseTimeline(db, selectedExercise, period).then((rows) => { if (active) setTimeline(rows); }).catch(() => { if (active) setError("Exercise history could not be loaded."); });
    return () => { active = false; };
  }, [db, period, selectedExercise]);

  const activityMax = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const progressValues = timeline.map((point) => selectedExercise?.loadType !== "bodyweight" ? point.bestLoadKg ?? 0 : point.totalReps);
  const progressMax = Math.max(1, ...progressValues);

  return <SafeAreaView style={s.safe} edges={["top"]}><AtmosphereBackground /><ScrollView contentContainerStyle={s.content}>
    <Text style={s.wordmark}>IRON CHRONICLES</Text><Text style={s.eyebrow}>THE CHRONICLE</Text><Text style={s.title}>Progress</Text><Text style={s.description}>A clear account of completed work, records, and changes over time.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}

    <View style={s.statsGrid}>
      <Stat label="COMPLETED WORKOUTS" value={summary?.totalWorkouts.toLocaleString() ?? "—"} />
      <Stat label="THIS WEEK" value={summary?.workoutsThisWeek.toLocaleString() ?? "—"} />
      <Stat label="THIS MONTH" value={summary?.workoutsThisMonth.toLocaleString() ?? "—"} />
      <Stat label="MOVEMENTS TRAINED" value={summary?.distinctExercises.toLocaleString() ?? "—"} />
    </View>
    <View style={s.summaryStrip}><View><Text style={s.summaryLabel}>RECORDED TRAINING VOLUME</Text><Text style={s.summaryValue}>{summary ? `${summary.recordedVolumeKg.toLocaleString()} kg` : "—"}</Text></View><View style={s.summaryDivider} /><View><Text style={s.summaryLabel}>BEST ESTIMATED 1RM</Text><Text style={s.summaryValue}>{summary?.bestEstimatedOneRepMaxKg ? `${summary.bestEstimatedOneRepMaxKg.toFixed(1)} kg` : "—"}</Text></View></View>

    <View style={s.sectionHead}><Text style={s.sectionTitle}>TRAINING FREQUENCY</Text><View style={s.periodTabs}>{(["weeks", "months"] as const).map((value) => <Pressable key={value} onPress={() => setPeriod(value)} style={[s.periodButton, period === value && s.periodSelected]}><Text style={[s.periodText, period === value && s.periodTextSelected]}>{value === "weeks" ? "WEEKS" : "MONTHS"}</Text></Pressable>)}</View></View>
    <View style={s.chartCard}><Text style={s.chartTitle}>Workouts per {period === "weeks" ? "week" : "month"}</Text><Text style={s.chartHint}>Completed sessions · 12 {period}</Text><View style={s.barChart}>{buckets.map((bucket) => <View key={bucket.key} style={s.barColumn}><Text style={s.barValue}>{bucket.count || ""}</Text><View style={s.barTrack}><View style={[s.bar, { height: bucket.count ? Math.max(4, (bucket.count / activityMax) * 84) : 2 }]} /></View><Text style={s.barLabel}>{bucket.label}</Text></View>)}</View><View style={s.chartAxis}><Text style={s.axisText}>0</Text><Text style={s.axisText}>Sessions</Text></View></View>

    <View style={s.sectionHead}><Text style={s.sectionTitle}>EXERCISE PROGRESSION</Text></View>
    <TextInput accessibilityLabel="Search exercises in progress" value={exerciseQuery} onChangeText={setExerciseQuery} placeholder="Search your training history" placeholderTextColor="#77736D" style={s.search} />
    {filteredExercises.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.exerciseChips}>{filteredExercises.slice(0, 24).map((exercise) => <Pressable key={exercise.key} onPress={() => setSelectedKey(exercise.key)} style={[s.exerciseChip, selectedExercise?.key === exercise.key && s.exerciseChipActive]}><Text style={[s.exerciseChipName, selectedExercise?.key === exercise.key && s.exerciseChipNameActive]}>{exercise.name}</Text></Pressable>)}</ScrollView> : <Text style={s.emptyInline}>{exerciseQuery ? "No matching exercise history." : "Completed sessions will appear here."}</Text>}
    {selectedExercise ? <View style={s.exercisePanel}>
      <Text style={s.exerciseTitle}>{selectedExercise.name}</Text><Text style={s.exerciseMeta}>{selectedExercise.muscle} · {selectedExercise.equipment}</Text>
      <Text style={s.chartTitle}>{selectedExercise.loadType === "external" ? "Top working-set load (kg)" : selectedExercise.loadType === "bodyweight_added_load" ? "Top added load (kg)" : "Working reps per session"}</Text>
      {timeline.length ? <View style={s.progressChart}>{timeline.map((point) => {
        const value = selectedExercise.loadType !== "bodyweight" ? point.bestLoadKg ?? 0 : point.totalReps;
        return <View key={point.workoutId} style={s.progressColumn}><Text style={s.progressValue}>{value ? (selectedExercise.loadType !== "bodyweight" ? value : point.totalReps) : "—"}</Text><View style={s.progressTrack}><View style={[s.progressBar, { height: value ? Math.max(4, (value / progressMax) * 76) : 2 }]} /></View><Text style={s.progressLabel}>{new Date(point.completedAt).toLocaleDateString([], { month: "numeric", day: "numeric" })}</Text></View>;
      })}</View> : <Text style={s.emptyInline}>No completed working sets recorded in this time range.</Text>}
      {timeline.slice(-3).reverse().map((point) => <View key={`detail-${point.workoutId}`} style={s.sessionLine}><Text style={s.sessionDate}>{new Date(point.completedAt).toLocaleDateString()}</Text><Text style={s.sessionMetric}>{point.totalReps} reps{point.bestLoadKg !== null ? ` · ${selectedExercise.loadType === "bodyweight_added_load" ? "added" : "best"} ${point.bestLoadKg} kg` : ""}{point.estimatedOneRepMaxKg !== null ? ` · e1RM ${point.estimatedOneRepMaxKg.toFixed(1)} kg` : ""}</Text></View>)}
    </View> : null}

    <View style={s.sectionHead}><Text style={s.sectionTitle}>PERSONAL RECORDS</Text><Text style={s.sectionCount}>{records.length}</Text></View>
    {records.length ? records.slice(0, 16).map((record) => <View key={record.key} style={s.recordRow}><View style={s.recordSeal}><Text style={s.recordGlyph}>✧</Text></View><View style={s.recordCopy}><Text style={s.recordName}>{record.exerciseName}</Text><Text style={s.recordType}>{record.title} · {new Date(record.achievedAt).toLocaleDateString()}</Text></View><Text style={s.recordValue}>{record.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} {record.unit}</Text></View>) : <View style={s.emptyPanel}><Text style={s.emptyTitle}>No records yet</Text><Text style={s.emptyInline}>Loaded working sets will build records as you train.</Text></View>}

    <View style={s.sectionHead}><Text style={s.sectionTitle}>MILESTONES</Text><Text style={s.sectionCount}>{milestones.length}</Text></View>
    {milestones.length ? milestones.map((milestone) => <View key={milestone.key} style={s.milestoneRow}><Text style={s.milestoneMark}>✦</Text><View style={s.milestoneCopy}><Text style={s.milestoneTitle}>{milestone.title}</Text><Text style={s.milestoneDetail}>{milestone.detail}</Text></View><Text style={s.milestoneDate}>{new Date(milestone.earnedAt).toLocaleDateString()}</Text></View>) : <View style={s.emptyPanel}><Text style={s.emptyTitle}>{loading ? "Reading your record…" : "The first entry is ahead"}</Text><Text style={s.emptyInline}>Milestones are earned from completed workouts and real training records.</Text></View>}
    <Text style={s.footnote}>Estimated 1RM uses Epley for loaded working sets of 1–10 reps. Recorded volume includes external load only.</Text>
  </ScrollView></SafeAreaView>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text></View>; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 30 },
  wordmark: { color: C.gold, fontSize: 12, letterSpacing: 3, fontFamily: "serif", marginBottom: 28 },
  eyebrow: { color: C.gold, fontSize: 10, letterSpacing: 2, marginBottom: 9 },
  title: { color: C.text, fontSize: 31, fontFamily: "serif" },
  description: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 18 },
  error: { color: "#D88A73", fontSize: 12, marginBottom: 10 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "48.5%", minHeight: 65, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, justifyContent: "center" },
  statLabel: { color: C.muted, fontSize: 8, letterSpacing: 0.5 },
  statValue: { color: C.text, fontSize: 18, fontWeight: "600", marginTop: 5 },
  summaryStrip: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: "#211E1A", borderWidth: 1, borderColor: "#5C4930", borderRadius: 8, padding: 12, marginTop: 9 },
  summaryLabel: { color: C.gold, fontSize: 7, letterSpacing: 0.65 },
  summaryValue: { color: C.parchment, fontSize: 15, fontWeight: "600", marginTop: 4 },
  summaryDivider: { width: 1, height: 34, backgroundColor: "#5C4930" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 10 },
  sectionTitle: { color: C.parchment, fontFamily: "serif", fontSize: 16 },
  sectionCount: { color: C.gold, fontSize: 11 },
  periodTabs: { flexDirection: "row", borderWidth: 1, borderColor: C.line, borderRadius: 7, overflow: "hidden" },
  periodButton: { minHeight: 30, justifyContent: "center", paddingHorizontal: 9 },
  periodSelected: { backgroundColor: "#29251F" },
  periodText: { color: C.muted, fontSize: 8, letterSpacing: 0.5 },
  periodTextSelected: { color: C.gold },
  chartCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 12 },
  chartTitle: { color: C.parchment, fontSize: 12, fontWeight: "600" },
  chartHint: { color: C.muted, fontSize: 9, marginTop: 3 },
  barChart: { height: 124, flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 12 },
  barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  barValue: { height: 14, color: C.muted, fontSize: 8 },
  barTrack: { width: "72%", height: 86, justifyContent: "flex-end", alignItems: "center", borderBottomColor: C.line, borderBottomWidth: 1 },
  bar: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: C.gold },
  barLabel: { color: C.muted, fontSize: 7, marginTop: 4 },
  chartAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisText: { color: C.muted, fontSize: 8 },
  search: { height: 43, borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: C.panel, color: C.text, paddingHorizontal: 12, fontSize: 11 },
  exerciseChips: { gap: 7, paddingVertical: 9 },
  exerciseChip: { minHeight: 31, paddingHorizontal: 10, justifyContent: "center", borderWidth: 1, borderColor: C.line, borderRadius: 17, backgroundColor: C.panel },
  exerciseChipActive: { borderColor: "#806A45", backgroundColor: "#211E1A" },
  exerciseChipName: { color: C.muted, fontSize: 9 },
  exerciseChipNameActive: { color: C.gold },
  exercisePanel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 12, marginTop: 3 },
  exerciseTitle: { color: C.text, fontFamily: "serif", fontSize: 17 },
  exerciseMeta: { color: C.muted, fontSize: 10, marginTop: 4, marginBottom: 13 },
  progressChart: { flexDirection: "row", height: 118, alignItems: "flex-end", gap: 7, marginTop: 8 },
  progressColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  progressValue: { color: C.muted, fontSize: 7, height: 12 },
  progressTrack: { width: "75%", height: 78, borderBottomColor: C.line, borderBottomWidth: 1, justifyContent: "flex-end", alignItems: "center" },
  progressBar: { width: "100%", backgroundColor: C.ember, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  progressLabel: { color: C.muted, fontSize: 7, marginTop: 4 },
  sessionLine: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, marginTop: 8, gap: 8 },
  sessionDate: { color: C.muted, fontSize: 9 },
  sessionMetric: { color: C.parchment, fontSize: 9, flex: 1, textAlign: "right" },
  recordRow: { minHeight: 59, flexDirection: "row", alignItems: "center", backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 9, marginBottom: 7 },
  recordSeal: { width: 38, height: 38, borderWidth: 1, borderColor: "#514633", borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 10 },
  recordGlyph: { color: C.gold, fontSize: 16 },
  recordCopy: { flex: 1 },
  recordName: { color: C.text, fontSize: 11, fontWeight: "600" },
  recordType: { color: C.muted, fontSize: 8, marginTop: 4 },
  recordValue: { color: C.gold, fontSize: 10, fontWeight: "700", marginLeft: 8 },
  milestoneRow: { minHeight: 57, flexDirection: "row", alignItems: "center", backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 10 },
  milestoneMark: { color: C.gold, fontSize: 16, width: 28 },
  milestoneCopy: { flex: 1 },
  milestoneTitle: { color: C.text, fontSize: 11, fontWeight: "600" },
  milestoneDetail: { color: C.muted, fontSize: 9, marginTop: 4 },
  milestoneDate: { color: C.gold, fontSize: 8, marginLeft: 6 },
  emptyPanel: { alignItems: "center", backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 18 },
  emptyTitle: { color: C.parchment, fontFamily: "serif", fontSize: 15 },
  emptyInline: { color: C.muted, fontSize: 10, marginTop: 6, textAlign: "center" },
  footnote: { color: "#716C65", fontSize: 9, lineHeight: 14, marginTop: 16, textAlign: "center" },
  
});
