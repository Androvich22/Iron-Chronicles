import type { SQLiteDatabase } from "expo-sqlite";
import type { Exercise } from "./exerciseRepository";
import { getRoutine } from "./routineRepository";
import { recalculateAchievements } from "./progressRepository";

export type WorkoutSet = {
  id: string;
  orderIndex: number;
  setType: "working" | "warm_up";
  repetitions: number | null;
  loadKg: number | null;
  isCompleted: boolean;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string | null;
  name: string;
  primaryMuscleGroup: string;
  equipment: string;
  loadType: string;
  trackingType: string;
  orderIndex: number;
  restSeconds: number | null;
  targetSetCount: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  sets: WorkoutSet[];
};

export type WorkoutDetailExercise = WorkoutExercise & { isOmitted: boolean };
export type WorkoutDetail = { id: string; routineName: string | null; startedAt: string; completedAt: string; notes: string | null; exercises: WorkoutDetailExercise[] };

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function startOrResumeWorkout(db: SQLiteDatabase): Promise<string> {
  const active = await db.getFirstAsync<{ id: string }>("SELECT id FROM workouts WHERE status = 'active' LIMIT 1");
  if (active) return active.id;

  const id = makeId("workout");
  await db.runAsync("INSERT INTO workouts (id, status, started_at) VALUES (?, 'active', ?)", id, new Date().toISOString());
  return id;
}

export async function startWorkoutFromRoutine(db: SQLiteDatabase, routineId: string): Promise<string> {
  const active = await db.getFirstAsync<{ id: string; routine_id: string | null }>("SELECT id, routine_id FROM workouts WHERE status = 'active' LIMIT 1");
  if (active) {
    if (active.routine_id === routineId) return active.id;
    throw new Error("An active workout is already in progress. Resume or finish it before starting another routine.");
  }
  const routine = await getRoutine(db, routineId);
  if (!routine || !routine.exercises.length) throw new Error("This routine has no exercises to start.");
  const workoutId = makeId("workout");
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO workouts (id, routine_id, routine_name_snapshot, status, started_at) VALUES (?, ?, ?, 'active', ?)",
      workoutId, routine.id, routine.name, new Date().toISOString(),
    );
    for (const item of routine.exercises) {
      const workoutExerciseId = makeId("we");
      await db.runAsync(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, exercise_name_snapshot, primary_muscle_group_snapshot, equipment_snapshot, load_type_snapshot, tracking_type_snapshot, order_index, target_set_count, target_rep_min, target_rep_max, rest_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        workoutExerciseId, workoutId, item.exercise.id, item.exercise.name, item.exercise.primaryMuscleGroup, item.exercise.equipment,
        item.exercise.loadType, item.exercise.trackingType, item.orderIndex, item.targetSetCount, item.targetRepMin, item.targetRepMax, item.restSeconds,
      );
      for (let setIndex = 0; setIndex < item.targetSetCount; setIndex += 1) {
        await db.runAsync(
          "INSERT INTO sets (id, workout_exercise_id, order_index, set_type, repetitions, load_kg) VALUES (?, ?, ?, 'working', NULL, ?)",
          makeId("set"), workoutExerciseId, setIndex, item.targetLoadKg,
        );
      }
    }
  });
  return workoutId;
}

export async function getActiveWorkout(db: SQLiteDatabase) {
  return db.getFirstAsync<{ id: string; started_at: string; routine_name_snapshot: string | null; rest_timer_end_at: string | null; rest_timer_duration_seconds: number }>(
    "SELECT id, started_at, routine_name_snapshot, rest_timer_end_at, rest_timer_duration_seconds FROM workouts WHERE status = 'active' LIMIT 1",
  );
}

export async function listWorkoutHistory(db: SQLiteDatabase) {
  return db.getAllAsync<{ id: string; started_at: string; completed_at: string; routine_name_snapshot: string | null; exercise_count: number; completed_set_count: number }>(
    `SELECT w.id, w.started_at, w.completed_at, w.routine_name_snapshot,
      COUNT(DISTINCT we.id) AS exercise_count,
      COUNT(DISTINCT CASE WHEN s.is_completed = 1 THEN s.id END) AS completed_set_count
     FROM workouts w
     LEFT JOIN workout_exercises we ON we.workout_id = w.id AND we.is_omitted = 0
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.status = 'completed'
     GROUP BY w.id
     ORDER BY w.completed_at DESC`,
  );
}

export async function addWorkoutExercise(db: SQLiteDatabase, workoutId: string, exercise: Exercise) {
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workout_exercises WHERE workout_id = ? AND exercise_id = ? AND is_omitted = 0 LIMIT 1",
    workoutId,
    exercise.id,
  );
  if (existing) return existing.id;

  const order = await db.getFirstAsync<{ next_order: number }>(
    "SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM workout_exercises WHERE workout_id = ?",
    workoutId,
  );
  const id = makeId("we");
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workout_exercises (id, workout_id, exercise_id, exercise_name_snapshot, primary_muscle_group_snapshot, equipment_snapshot, load_type_snapshot, tracking_type_snapshot, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      workoutId,
      exercise.id,
      exercise.name,
      exercise.primaryMuscleGroup,
      exercise.equipment,
      exercise.loadType,
      exercise.trackingType,
      order?.next_order ?? 0,
    );
    await addSet(db, id);
  });
  return id;
}

export async function omitWorkoutExercise(db: SQLiteDatabase, workoutExerciseId: string) {
  await db.runAsync(
    `UPDATE workout_exercises SET is_omitted = 1
     WHERE id = ? AND workout_id IN (SELECT id FROM workouts WHERE status = 'active')`,
    workoutExerciseId,
  );
}

export async function addSet(db: SQLiteDatabase, workoutExerciseId: string) {
  const order = await db.getFirstAsync<{ next_order: number }>(
    "SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM sets WHERE workout_exercise_id = ?",
    workoutExerciseId,
  );
  const id = makeId("set");
  await db.runAsync(
    "INSERT INTO sets (id, workout_exercise_id, order_index, set_type, repetitions) VALUES (?, ?, ?, 'working', NULL)",
    id,
    workoutExerciseId,
    order?.next_order ?? 0,
  );
  return id;
}

export async function updateSetValue(db: SQLiteDatabase, setId: string, field: "repetitions" | "load_kg", value: number | null) {
  if (value !== null && (!Number.isFinite(value) || value < 0 || (field === "repetitions" && (!Number.isInteger(value) || value === 0)))) {
    throw new Error("Set values must be positive numbers.");
  }
  await db.runAsync(`UPDATE sets SET ${field} = ? WHERE id = ?`, value, setId);
}

export async function toggleSetType(db: SQLiteDatabase, setId: string, current: "working" | "warm_up") {
  const next = current === "working" ? "warm_up" : "working";
  await db.runAsync("UPDATE sets SET set_type = ? WHERE id = ? AND is_completed = 0", next, setId);
  return next;
}

export async function completeWorkoutSet(db: SQLiteDatabase, workoutId: string, setId: string, restSeconds: number) {
  const set = await db.getFirstAsync<{ repetitions: number | null; is_completed: number }>("SELECT repetitions, is_completed FROM sets WHERE id = ?", setId);
  if (!set || set.repetitions === null || set.repetitions < 1) throw new Error("Enter repetitions before completing this set.");
  if (set.is_completed) return null;

  const completedAt = new Date();
  const timerEnd = new Date(completedAt.getTime() + restSeconds * 1000);
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE sets SET is_completed = 1, completed_at = ? WHERE id = ?", completedAt.toISOString(), setId);
    await db.runAsync("UPDATE workouts SET rest_timer_end_at = ?, rest_timer_duration_seconds = ? WHERE id = ? AND status = 'active'", timerEnd.toISOString(), restSeconds, workoutId);
  });
  return timerEnd.toISOString();
}

export async function clearRestTimer(db: SQLiteDatabase, workoutId: string) {
  await db.runAsync("UPDATE workouts SET rest_timer_end_at = NULL WHERE id = ? AND status = 'active'", workoutId);
}

export async function extendRestTimer(db: SQLiteDatabase, workoutId: string, seconds = 90) {
  const workout = await db.getFirstAsync<{ rest_timer_end_at: string | null }>("SELECT rest_timer_end_at FROM workouts WHERE id = ? AND status = 'active'", workoutId);
  if (!workout) return;
  const base = Math.max(Date.now(), workout.rest_timer_end_at ? new Date(workout.rest_timer_end_at).getTime() : Date.now());
  await db.runAsync("UPDATE workouts SET rest_timer_end_at = ?, rest_timer_duration_seconds = rest_timer_duration_seconds + ? WHERE id = ? AND status = 'active'", new Date(base + seconds * 1000).toISOString(), seconds, workoutId);
}

export async function finishWorkout(db: SQLiteDatabase, workoutId: string) {
  const completedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE workouts SET status = 'completed', completed_at = ?, rest_timer_end_at = NULL WHERE id = ? AND status = 'active'", completedAt, workoutId);
  });
  await recalculateAchievements(db);
}

export async function getWorkoutDetail(db: SQLiteDatabase, workoutId: string): Promise<WorkoutDetail | null> {
  const workout = await db.getFirstAsync<{ id: string; routine_name_snapshot: string | null; started_at: string; completed_at: string; notes: string | null }>(
    "SELECT id, routine_name_snapshot, started_at, completed_at, notes FROM workouts WHERE id = ? AND status = 'completed' LIMIT 1", workoutId,
  );
  if (!workout) return null;
  const rows = await db.getAllAsync<{
    id: string; exercise_id: string | null; exercise_name_snapshot: string; primary_muscle_group_snapshot: string; equipment_snapshot: string;
    load_type_snapshot: string; tracking_type_snapshot: string; order_index: number; rest_seconds: number | null; target_set_count: number | null;
    target_rep_min: number | null; target_rep_max: number | null; is_omitted: number; set_id: string | null; set_order: number | null;
    set_type: "working" | "warm_up" | null; repetitions: number | null; load_kg: number | null; is_completed: number | null;
  }>(
    `SELECT we.id, we.exercise_id, we.exercise_name_snapshot, we.primary_muscle_group_snapshot, we.equipment_snapshot,
       we.load_type_snapshot, we.tracking_type_snapshot, we.order_index, we.rest_seconds, we.target_set_count, we.target_rep_min,
       we.target_rep_max, we.is_omitted, s.id AS set_id, s.order_index AS set_order, s.set_type, s.repetitions, s.load_kg, s.is_completed
     FROM workout_exercises we LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE we.workout_id = ? ORDER BY we.order_index, s.order_index`, workoutId,
  );
  const groups = new Map<string, WorkoutDetailExercise>();
  for (const row of rows) {
    let group = groups.get(row.id);
    if (!group) {
      group = { id: row.id, exerciseId: row.exercise_id, name: row.exercise_name_snapshot, primaryMuscleGroup: row.primary_muscle_group_snapshot,
        equipment: row.equipment_snapshot, loadType: row.load_type_snapshot, trackingType: row.tracking_type_snapshot, orderIndex: row.order_index,
        restSeconds: row.rest_seconds, targetSetCount: row.target_set_count, targetRepMin: row.target_rep_min, targetRepMax: row.target_rep_max,
        isOmitted: row.is_omitted === 1, sets: [] };
      groups.set(row.id, group);
    }
    if (row.set_id && row.set_order !== null && row.set_type) group.sets.push({ id: row.set_id, orderIndex: row.set_order, setType: row.set_type,
      repetitions: row.repetitions, loadKg: row.load_kg, isCompleted: row.is_completed === 1 });
  }
  return { id: workout.id, routineName: workout.routine_name_snapshot, startedAt: workout.started_at, completedAt: workout.completed_at, notes: workout.notes, exercises: [...groups.values()] };
}

export async function updateCompletedSet(db: SQLiteDatabase, setId: string, field: "repetitions" | "load_kg", value: number | null) {
  if (field === "repetitions" && (value === null || !Number.isInteger(value) || value < 1)) throw new Error("Completed sets need at least one repetition.");
  if (field === "load_kg" && value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Load must be zero or higher.");
  const result = await db.runAsync(
    `UPDATE sets SET ${field} = ? WHERE id = ? AND is_completed = 1 AND workout_exercise_id IN
       (SELECT we.id FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id WHERE w.status = 'completed')`, value, setId,
  );
  if (!result.changes) throw new Error("This completed set could not be updated.");
  await recalculateAchievements(db);
}

export async function toggleCompletedSetType(db: SQLiteDatabase, setId: string, current: "working" | "warm_up") {
  const next = current === "working" ? "warm_up" : "working";
  const result = await db.runAsync(
    `UPDATE sets SET set_type = ? WHERE id = ? AND is_completed = 1 AND workout_exercise_id IN
       (SELECT we.id FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id WHERE w.status = 'completed')`, next, setId,
  );
  if (!result.changes) throw new Error("This completed set could not be updated.");
  await recalculateAchievements(db);
  return next;
}

export async function deleteCompletedSet(db: SQLiteDatabase, setId: string) {
  const result = await db.runAsync(
    `DELETE FROM sets WHERE id = ? AND is_completed = 1 AND workout_exercise_id IN
       (SELECT we.id FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id WHERE w.status = 'completed')`, setId,
  );
  if (!result.changes) throw new Error("This completed set could not be deleted.");
  await recalculateAchievements(db);
}

export async function deleteCompletedWorkout(db: SQLiteDatabase, workoutId: string) {
  const result = await db.runAsync("DELETE FROM workouts WHERE id = ? AND status = 'completed'", workoutId);
  if (!result.changes) throw new Error("This completed workout could not be deleted.");
  await recalculateAchievements(db);
}

export async function listWorkoutExercises(db: SQLiteDatabase, workoutId: string): Promise<WorkoutExercise[]> {
  const rows = await db.getAllAsync<{
    id: string; exercise_id: string | null; exercise_name_snapshot: string; primary_muscle_group_snapshot: string;
    equipment_snapshot: string; load_type_snapshot: string; tracking_type_snapshot: string; order_index: number;
    rest_seconds: number | null; target_set_count: number | null; target_rep_min: number | null; target_rep_max: number | null;
    set_id: string | null; set_order: number | null; set_type: "working" | "warm_up" | null;
    repetitions: number | null; load_kg: number | null; is_completed: number | null;
  }>(
    `SELECT we.id, we.exercise_id, we.exercise_name_snapshot, we.primary_muscle_group_snapshot, we.equipment_snapshot,
      we.load_type_snapshot, we.tracking_type_snapshot, we.order_index, we.rest_seconds, we.target_set_count, we.target_rep_min, we.target_rep_max, s.id AS set_id, s.order_index AS set_order,
      s.set_type, s.repetitions, s.load_kg, s.is_completed
     FROM workout_exercises we LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE we.workout_id = ? AND we.is_omitted = 0
     ORDER BY we.order_index, s.order_index`,
    workoutId,
  );

  const groups = new Map<string, WorkoutExercise>();
  for (const row of rows) {
    let group = groups.get(row.id);
    if (!group) {
      group = { id: row.id, exerciseId: row.exercise_id, name: row.exercise_name_snapshot, primaryMuscleGroup: row.primary_muscle_group_snapshot, equipment: row.equipment_snapshot, loadType: row.load_type_snapshot, trackingType: row.tracking_type_snapshot, orderIndex: row.order_index, restSeconds: row.rest_seconds, targetSetCount: row.target_set_count, targetRepMin: row.target_rep_min, targetRepMax: row.target_rep_max, sets: [] };
      groups.set(row.id, group);
    }
    if (row.set_id && row.set_order !== null && row.set_type) {
      group.sets.push({ id: row.set_id, orderIndex: row.set_order, setType: row.set_type, repetitions: row.repetitions, loadKg: row.load_kg, isCompleted: row.is_completed === 1 });
    }
  }
  return [...groups.values()];
}

export async function getExerciseById(db: SQLiteDatabase, exerciseId: string): Promise<Exercise | null> {
  const rows = await db.getAllAsync<{ id: string; name: string; source: "built_in" | "user"; primary_muscle_group: string; secondary_muscle_groups_json: string; equipment: string; load_type: Exercise["loadType"]; tracking_type: Exercise["trackingType"]; instructions: string | null }>(
    "SELECT id, name, source, primary_muscle_group, secondary_muscle_groups_json, equipment, load_type, tracking_type, instructions FROM exercises WHERE id = ? AND is_archived = 0 LIMIT 1",
    exerciseId,
  );
  const row = rows[0];
  return row ? { id: row.id, name: row.name, source: row.source, primaryMuscleGroup: row.primary_muscle_group, secondaryMuscleGroups: JSON.parse(row.secondary_muscle_groups_json) as string[], equipment: row.equipment, loadType: row.load_type, trackingType: row.tracking_type, instructions: row.instructions } : null;
}

export async function getPreviousExercisePerformance(db: SQLiteDatabase, exerciseId: string) {
  return db.getFirstAsync<{ completed_at: string; set_count: number; total_reps: number; best_external_load: number | null; recorded_volume: number | null }>(
    `SELECT w.completed_at,
      COUNT(DISTINCT s.id) AS set_count,
      COALESCE(SUM(s.repetitions), 0) AS total_reps,
      MAX(CASE WHEN s.load_kg IS NOT NULL AND we.load_type_snapshot = 'external' THEN s.load_kg END) AS best_external_load,
      SUM(CASE WHEN s.load_kg IS NOT NULL AND we.load_type_snapshot = 'external' THEN s.load_kg * s.repetitions END) AS recorded_volume
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id AND s.is_completed = 1 AND s.set_type = 'working'
     WHERE w.status = 'completed' AND we.exercise_id = ?
     GROUP BY w.id ORDER BY w.completed_at DESC LIMIT 1`,
    exerciseId,
  );
}
