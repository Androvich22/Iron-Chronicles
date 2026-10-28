import type { SQLiteDatabase } from "expo-sqlite";
import type { Exercise } from "./exerciseRepository";

export type RoutineExerciseInput = {
  exerciseId: string;
  targetSetCount: number;
  targetRepMin: number;
  targetRepMax: number;
  targetLoadKg: number | null;
  restSeconds: number | null;
  note: string | null;
};

export type RoutineExercise = RoutineExerciseInput & { id: string; orderIndex: number; exercise: Exercise };
export type Routine = { id: string; name: string; notes: string | null; createdAt: string; updatedAt: string; exerciseCount: number };
export type RoutineDetail = Omit<Routine, "exerciseCount"> & { exercises: RoutineExercise[] };

function makeId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

export async function listRoutines(db: SQLiteDatabase): Promise<Routine[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; notes: string | null; created_at: string; updated_at: string; exercise_count: number }>(
    `SELECT r.id, r.name, r.notes, r.created_at, r.updated_at, COUNT(re.id) AS exercise_count
     FROM routines r LEFT JOIN routine_exercises re ON re.routine_id = r.id
     GROUP BY r.id ORDER BY r.updated_at DESC, r.name COLLATE NOCASE`,
  );
  return rows.map((row) => ({ id: row.id, name: row.name, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at, exerciseCount: row.exercise_count }));
}

export async function getRoutine(db: SQLiteDatabase, routineId: string): Promise<RoutineDetail | null> {
  const routine = await db.getFirstAsync<{ id: string; name: string; notes: string | null; created_at: string; updated_at: string }>(
    "SELECT id, name, notes, created_at, updated_at FROM routines WHERE id = ?", routineId,
  );
  if (!routine) return null;
  const rows = await db.getAllAsync<{
    routine_exercise_id: string; exercise_id: string; order_index: number; target_set_count: number; target_rep_min: number; target_rep_max: number;
    target_load_kg: number | null; rest_seconds: number | null; note: string | null; name: string; source: "built_in" | "user";
    primary_muscle_group: string; secondary_muscle_groups_json: string; equipment: string; load_type: Exercise["loadType"];
    tracking_type: Exercise["trackingType"]; instructions: string | null;
  }>(
    `SELECT re.id AS routine_exercise_id, re.exercise_id, re.order_index, re.target_set_count, re.target_rep_min, re.target_rep_max,
       re.target_load_kg, re.rest_seconds, re.note, e.name, e.source, e.primary_muscle_group, e.secondary_muscle_groups_json,
       e.equipment, e.load_type, e.tracking_type, e.instructions
     FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? ORDER BY re.order_index`,
    routineId,
  );
  return {
    id: routine.id, name: routine.name, notes: routine.notes, createdAt: routine.created_at, updatedAt: routine.updated_at,
    exercises: rows.map((row) => ({
      id: row.routine_exercise_id, exerciseId: row.exercise_id, orderIndex: row.order_index,
      targetSetCount: row.target_set_count, targetRepMin: row.target_rep_min, targetRepMax: row.target_rep_max,
      targetLoadKg: row.target_load_kg, restSeconds: row.rest_seconds, note: row.note,
      exercise: {
        id: row.exercise_id, name: row.name, source: row.source, primaryMuscleGroup: row.primary_muscle_group,
        secondaryMuscleGroups: JSON.parse(row.secondary_muscle_groups_json) as string[], equipment: row.equipment,
        loadType: row.load_type, trackingType: row.tracking_type, instructions: row.instructions,
      },
    })),
  };
}

export async function saveRoutine(db: SQLiteDatabase, routineId: string | null, name: string, notes: string, exercises: RoutineExerciseInput[]): Promise<string> {
  const cleanedName = name.trim();
  if (!cleanedName) throw new Error("Give this routine a name.");
  if (!exercises.length) throw new Error("Add at least one exercise to this routine.");
  for (const item of exercises) {
    if (!Number.isInteger(item.targetSetCount) || item.targetSetCount < 1 || !Number.isInteger(item.targetRepMin) || item.targetRepMin < 1 || !Number.isInteger(item.targetRepMax) || item.targetRepMax < item.targetRepMin) {
      throw new Error("Check each exercise’s set count and rep range.");
    }
    if (item.targetLoadKg !== null && (!Number.isFinite(item.targetLoadKg) || item.targetLoadKg < 0)) throw new Error("Target load must be zero or higher.");
    if (item.restSeconds !== null && (!Number.isInteger(item.restSeconds) || item.restSeconds < 1)) throw new Error("Rest time must be a positive number of seconds.");
  }
  const id = routineId ?? makeId("routine");
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    if (routineId) {
      await db.runAsync("UPDATE routines SET name = ?, notes = ?, updated_at = ? WHERE id = ?", cleanedName, notes.trim() || null, now, id);
      await db.runAsync("DELETE FROM routine_exercises WHERE routine_id = ?", id);
    } else {
      await db.runAsync("INSERT INTO routines (id, name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", id, cleanedName, notes.trim() || null, now, now);
    }
    for (let index = 0; index < exercises.length; index += 1) {
      const item = exercises[index];
      await db.runAsync(
        `INSERT INTO routine_exercises (id, routine_id, exercise_id, order_index, target_set_count, target_rep_min, target_rep_max, target_load_kg, rest_seconds, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        makeId("routine-exercise"), id, item.exerciseId, index, item.targetSetCount, item.targetRepMin, item.targetRepMax, item.targetLoadKg, item.restSeconds, item.note?.trim() || null,
      );
    }
  });
  return id;
}

export async function deleteRoutine(db: SQLiteDatabase, routineId: string) {
  await db.runAsync("DELETE FROM routines WHERE id = ?", routineId);
}

export async function duplicateRoutine(db: SQLiteDatabase, routineId: string): Promise<string> {
  const source = await getRoutine(db, routineId);
  if (!source) throw new Error("This routine could not be found.");
  return saveRoutine(db, null, `${source.name} Copy`, source.notes ?? "", source.exercises.map((item) => ({
    exerciseId: item.exerciseId, targetSetCount: item.targetSetCount, targetRepMin: item.targetRepMin, targetRepMax: item.targetRepMax,
    targetLoadKg: item.targetLoadKg, restSeconds: item.restSeconds, note: item.note,
  })));
}
