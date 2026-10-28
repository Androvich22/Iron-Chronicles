import type { SQLiteDatabase } from "expo-sqlite";

export type ProgressPeriod = "weeks" | "months";
export type ActivityBucket = { key: string; label: string; count: number };
export type ProgressExercise = { id: string | null; key: string; name: string; muscle: string; equipment: string; loadType: string; trackingType: string };
export type ExerciseProgressPoint = { workoutId: string; completedAt: string; setCount: number; totalReps: number; volumeKg: number; bestLoadKg: number | null; estimatedOneRepMaxKg: number | null; bestReps: number | null };
export type PersonalRecord = { key: string; exerciseId: string | null; exerciseName: string; title: string; value: number; unit: string; achievedAt: string };
export type TrainingMilestone = { key: string; title: string; detail: string; earnedAt: string };

type LoadedSetRow = { workout_id: string; exercise_id: string | null; exercise_name: string; equipment: string; load_type: "external" | "bodyweight_added_load"; load_kg: number; repetitions: number; completed_at: string };

function exerciseKey(id: string | null, name: string, equipment: string) { return id ?? `snapshot:${name}|${equipment}`; }
function roundLoad(value: number) { return Math.round(value * 100) / 100; }
function estimateOneRepMax(load: number, repetitions: number) { return repetitions >= 1 && repetitions <= 10 ? load * (1 + repetitions / 30) : null; }

async function getLoadedSetRows(db: SQLiteDatabase): Promise<LoadedSetRow[]> {
  return db.getAllAsync<LoadedSetRow>(
    `SELECT w.id AS workout_id, we.exercise_id, we.exercise_name_snapshot AS exercise_name, we.equipment_snapshot AS equipment,
       we.load_type_snapshot AS load_type, s.load_kg, s.repetitions, w.completed_at
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.status = 'completed' AND we.is_omitted = 0 AND we.load_type_snapshot IN ('external', 'bodyweight_added_load')
       AND s.is_completed = 1 AND s.set_type = 'working' AND s.load_kg IS NOT NULL AND s.repetitions IS NOT NULL
     ORDER BY w.completed_at ASC, s.completed_at ASC, s.order_index ASC`,
  );
}

export async function recalculateAchievements(db: SQLiteDatabase) {
  const workouts = await db.getAllAsync<{ id: string; completed_at: string }>(
    "SELECT id, completed_at FROM workouts WHERE status = 'completed' ORDER BY completed_at ASC",
  );
  const earned = new Map<string, string>();
  if (workouts[0]) earned.set("first_workout", workouts[0].completed_at);
  if (workouts[24]) earned.set("25_workouts", workouts[24].completed_at);
  if (workouts[99]) earned.set("100_workouts", workouts[99].completed_at);

  const rows = await getLoadedSetRows(db);
  const heaviest = new Map<string, number>();
  const repsAtLoad = new Map<string, number>();
  const bestE1rm = new Map<string, number>();
  for (const row of rows) {
    const key = `${exerciseKey(row.exercise_id, row.exercise_name, row.equipment)}|${row.load_type}`;
    const load = roundLoad(row.load_kg);
    const repKey = `${key}|${load}`;
    const e1rm = row.load_type === "external" ? estimateOneRepMax(row.load_kg, row.repetitions) : null;
    const isRecord = row.load_kg > (heaviest.get(key) ?? -1)
      || row.repetitions > (repsAtLoad.get(repKey) ?? 0)
      || (e1rm !== null && e1rm > (bestE1rm.get(key) ?? 0));
    if (isRecord && !earned.has("first_personal_record")) earned.set("first_personal_record", row.completed_at);
    heaviest.set(key, Math.max(heaviest.get(key) ?? 0, row.load_kg));
    repsAtLoad.set(repKey, Math.max(repsAtLoad.get(repKey) ?? 0, row.repetitions));
    if (e1rm !== null) bestE1rm.set(key, Math.max(bestE1rm.get(key) ?? 0, e1rm));
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM achievements WHERE achievement_key IN ('first_workout', 'first_personal_record', '25_workouts', '100_workouts')");
    for (const [key, earnedAt] of earned) {
      await db.runAsync("INSERT INTO achievements (id, achievement_key, earned_at) VALUES (?, ?, ?)", `milestone-${key}`, key, earnedAt);
    }
  });
}

export async function getTrainingMilestones(db: SQLiteDatabase): Promise<TrainingMilestone[]> {
  const rows = await db.getAllAsync<{ achievement_key: string; earned_at: string }>("SELECT achievement_key, earned_at FROM achievements ORDER BY earned_at");
  const copy: Record<string, { title: string; detail: string }> = {
    first_workout: { title: "First entry", detail: "Completed your first workout." },
    first_personal_record: { title: "First personal record", detail: "Set your first loaded working-set record." },
    "25_workouts": { title: "25 workouts", detail: "Completed 25 training sessions." },
    "100_workouts": { title: "100 workouts", detail: "Completed 100 training sessions." },
  };
  return rows.flatMap((row) => {
    const milestone = copy[row.achievement_key];
    return milestone ? [{ key: row.achievement_key, ...milestone, earnedAt: row.earned_at }] : [];
  });
}

export async function getActivityBuckets(db: SQLiteDatabase, period: ProgressPeriod, now = new Date()): Promise<ActivityBucket[]> {
  const starts: Date[] = [];
  if (period === "weeks") {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    for (let index = 11; index >= 0; index -= 1) starts.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - index * 7));
  } else {
    for (let index = 11; index >= 0; index -= 1) starts.push(new Date(now.getFullYear(), now.getMonth() - index, 1));
  }
  const rows = await db.getAllAsync<{ started_at: string }>("SELECT started_at FROM workouts WHERE status = 'completed'");
  return starts.map((start, index) => {
    const next = period === "weeks" ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) : new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const count = rows.reduce((total, row) => {
      const date = new Date(row.started_at);
      return total + (date >= start && date < next ? 1 : 0);
    }, 0);
    return { key: start.toISOString(), label: period === "weeks" ? `W${index + 1}` : start.toLocaleDateString("en", { month: "short" }), count };
  });
}

export async function getProgressSummary(db: SQLiteDatabase) {
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const [totals, volume, bestE1rm, exerciseCount] = await Promise.all([
    db.getFirstAsync<{ total: number; week: number; month: number }>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END) AS week,
        SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END) AS month FROM workouts WHERE status = 'completed'`, weekStart, monthStart,
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(s.load_kg * s.repetitions) AS total FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id
       JOIN sets s ON s.workout_exercise_id = we.id
       WHERE w.status = 'completed' AND we.is_omitted = 0 AND we.load_type_snapshot = 'external'
       AND s.is_completed = 1 AND s.set_type = 'working' AND s.load_kg IS NOT NULL AND s.repetitions IS NOT NULL`,
    ),
    db.getFirstAsync<{ value: number | null }>(
      `SELECT MAX(s.load_kg * (1.0 + s.repetitions / 30.0)) AS value FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id
       JOIN sets s ON s.workout_exercise_id = we.id
       WHERE w.status = 'completed' AND we.is_omitted = 0 AND we.load_type_snapshot = 'external'
       AND s.is_completed = 1 AND s.set_type = 'working' AND s.load_kg IS NOT NULL AND s.repetitions BETWEEN 1 AND 10`,
    ),
    db.getFirstAsync<{ total: number }>("SELECT COUNT(DISTINCT COALESCE(we.exercise_id, we.exercise_name_snapshot || '|' || we.equipment_snapshot)) AS total FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id WHERE w.status = 'completed' AND we.is_omitted = 0"),
  ]);
  return { totalWorkouts: totals?.total ?? 0, workoutsThisWeek: totals?.week ?? 0, workoutsThisMonth: totals?.month ?? 0, recordedVolumeKg: volume?.total ?? 0, bestEstimatedOneRepMaxKg: bestE1rm?.value ?? null, distinctExercises: exerciseCount?.total ?? 0 };
}

export async function listProgressExercises(db: SQLiteDatabase): Promise<ProgressExercise[]> {
  const rows = await db.getAllAsync<{ exercise_id: string | null; name: string; muscle: string; equipment: string; load_type: string; tracking_type: string }>(
    `SELECT DISTINCT we.exercise_id, we.exercise_name_snapshot AS name, we.primary_muscle_group_snapshot AS muscle,
       we.equipment_snapshot AS equipment, we.load_type_snapshot AS load_type, we.tracking_type_snapshot AS tracking_type
     FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
     WHERE w.status = 'completed' AND we.is_omitted = 0
     ORDER BY name COLLATE NOCASE`,
  );
  return rows.map((row) => ({ id: row.exercise_id, key: exerciseKey(row.exercise_id, row.name, row.equipment), name: row.name, muscle: row.muscle, equipment: row.equipment, loadType: row.load_type, trackingType: row.tracking_type }));
}

export async function getExerciseTimeline(db: SQLiteDatabase, exercise: ProgressExercise, period: ProgressPeriod): Promise<ExerciseProgressPoint[]> {
  const end = new Date();
  const start = period === "weeks" ? new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7 * 12) : new Date(end.getFullYear(), end.getMonth() - 11, 1);
  const rows = await db.getAllAsync<{
    workout_id: string; completed_at: string; load_type: string; load_kg: number | null; repetitions: number | null; set_type: string;
  }>(
    `SELECT w.id AS workout_id, w.completed_at, we.load_type_snapshot AS load_type, s.load_kg, s.repetitions, s.set_type
     FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.status = 'completed' AND we.is_omitted = 0 AND w.started_at >= ?
       AND ((? IS NOT NULL AND we.exercise_id = ?) OR (? IS NULL AND we.exercise_id IS NULL AND we.exercise_name_snapshot = ? AND we.equipment_snapshot = ?))
     ORDER BY w.completed_at ASC, s.order_index ASC`,
    start.toISOString(), exercise.id, exercise.id, exercise.id, exercise.name, exercise.equipment,
  );
  const points = new Map<string, ExerciseProgressPoint>();
  for (const row of rows) {
    let point = points.get(row.workout_id);
    if (!point) {
      point = { workoutId: row.workout_id, completedAt: row.completed_at, setCount: 0, totalReps: 0, volumeKg: 0, bestLoadKg: null, estimatedOneRepMaxKg: null, bestReps: null };
      points.set(row.workout_id, point);
    }
    if (row.set_type !== "working" || row.repetitions === null) continue;
    point.setCount += 1;
    point.totalReps += row.repetitions;
    point.bestReps = Math.max(point.bestReps ?? 0, row.repetitions);
    if (row.load_type === "external" && row.load_kg !== null) {
      point.volumeKg += row.load_kg * row.repetitions;
      point.bestLoadKg = Math.max(point.bestLoadKg ?? 0, row.load_kg);
      const e1rm = estimateOneRepMax(row.load_kg, row.repetitions);
      if (e1rm !== null) point.estimatedOneRepMaxKg = Math.max(point.estimatedOneRepMaxKg ?? 0, e1rm);
    } else if (row.load_type === "bodyweight_added_load" && row.load_kg !== null) {
      point.bestLoadKg = Math.max(point.bestLoadKg ?? 0, row.load_kg);
    }
  }
  return [...points.values()];
}

export async function getPersonalRecords(db: SQLiteDatabase): Promise<PersonalRecord[]> {
  const rows = await getLoadedSetRows(db);
  const records: PersonalRecord[] = [];
  const heaviest = new Map<string, PersonalRecord>();
  const bestReps = new Map<string, PersonalRecord>();
  const bestE1rm = new Map<string, PersonalRecord>();
  const volumeBySession = new Map<string, { exerciseKey: string; exerciseId: string | null; exerciseName: string; workoutId: string; date: string; value: number }>();
  for (const row of rows) {
    const baseKey = exerciseKey(row.exercise_id, row.exercise_name, row.equipment);
    const key = `${baseKey}|${row.load_type}`;
    const titleBase = row.exercise_name;
    const load = roundLoad(row.load_kg);
    const loadRecordKey = `${key}|${load}`;
    const previousLoad = heaviest.get(key);
    if (!previousLoad || row.load_kg > previousLoad.value) heaviest.set(key, { key: `load:${key}`, exerciseId: row.exercise_id, exerciseName: titleBase, title: row.load_type === "external" ? "Heaviest load" : "Heaviest added load", value: row.load_kg, unit: "kg", achievedAt: row.completed_at });
    const previousReps = bestReps.get(loadRecordKey);
    if (!previousReps || row.repetitions > previousReps.value) bestReps.set(loadRecordKey, { key: `reps:${loadRecordKey}`, exerciseId: row.exercise_id, exerciseName: titleBase, title: row.load_type === "external" ? `Most reps at ${load} kg` : `Most reps with ${load} kg added`, value: row.repetitions, unit: "reps", achievedAt: row.completed_at });
    const e1rm = row.load_type === "external" ? estimateOneRepMax(row.load_kg, row.repetitions) : null;
    const previousE1rm = bestE1rm.get(key);
    if (e1rm !== null && (!previousE1rm || e1rm > previousE1rm.value)) bestE1rm.set(key, { key: `e1rm:${key}`, exerciseId: row.exercise_id, exerciseName: titleBase, title: "Estimated 1RM", value: e1rm, unit: "kg", achievedAt: row.completed_at });
    if (row.load_type === "external") {
      const volumeKey = `${row.workout_id}|${key}`;
      const session = volumeBySession.get(volumeKey) ?? { exerciseKey: key, exerciseId: row.exercise_id, exerciseName: titleBase, workoutId: row.workout_id, date: row.completed_at, value: 0 };
      session.value += row.load_kg * row.repetitions;
      volumeBySession.set(volumeKey, session);
    }
  }
  records.push(...heaviest.values(), ...bestReps.values(), ...bestE1rm.values());
  const bestVolumeByExercise = new Map<string, PersonalRecord>();
  for (const session of volumeBySession.values()) {
    const exercise = session.exerciseKey;
    const current = bestVolumeByExercise.get(exercise);
    if (!current || session.value > current.value) bestVolumeByExercise.set(exercise, { key: `volume:${exercise}`, exerciseId: session.exerciseId, exerciseName: session.exerciseName, title: "Best session volume", value: session.value, unit: "kg", achievedAt: session.date });
  }
  records.push(...bestVolumeByExercise.values());
  return records.sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
}
