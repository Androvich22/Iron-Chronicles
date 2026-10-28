import type { SQLiteDatabase } from "expo-sqlite";

const FORMAT = "iron-chronicles-backup";
const VERSION = 1;

const TABLES = {
  exercises: ["id", "name", "source", "primary_muscle_group", "secondary_muscle_groups_json", "equipment", "load_type", "tracking_type", "instructions", "is_archived", "created_at", "updated_at"],
  routines: ["id", "name", "notes", "created_at", "updated_at"],
  routine_exercises: ["id", "routine_id", "exercise_id", "order_index", "target_set_count", "target_rep_min", "target_rep_max", "target_load_kg", "rest_seconds", "note"],
  workouts: ["id", "routine_id", "routine_name_snapshot", "status", "started_at", "completed_at", "rest_timer_end_at", "rest_timer_duration_seconds", "notes"],
  workout_exercises: ["id", "workout_id", "exercise_id", "exercise_name_snapshot", "primary_muscle_group_snapshot", "equipment_snapshot", "load_type_snapshot", "tracking_type_snapshot", "order_index", "target_set_count", "target_rep_min", "target_rep_max", "is_omitted", "rest_seconds"],
  sets: ["id", "workout_exercise_id", "order_index", "set_type", "repetitions", "load_kg", "assistance_kg", "note", "is_completed", "completed_at"],
  achievements: ["id", "achievement_key", "earned_at"],
  user_preferences: ["key", "value", "updated_at"],
} as const;

type BackupData = { -readonly [K in keyof typeof TABLES]: Record<string, unknown>[] };

export type BackupPreview = {
  exportedAt: string;
  exerciseCount: number;
  routineCount: number;
  workoutCount: number;
  setCount: number;
};

export async function createBackup(db: SQLiteDatabase): Promise<string> {
  const data = {} as BackupData;
  for (const table of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
    data[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBackup(input: unknown): { data: BackupData; preview: BackupPreview } {
  if (!isObject(input) || input.format !== FORMAT || input.version !== VERSION || !isObject(input.data)) {
    throw new Error("This file is not a supported Iron Chronicles backup.");
  }
  const exportedAt = typeof input.exportedAt === "string" && !Number.isNaN(Date.parse(input.exportedAt)) ? input.exportedAt : "Unknown date";
  const data = {} as BackupData;
  const keyFor: Record<string, Set<string>> = {};

  for (const [table, columns] of Object.entries(TABLES)) {
    const rows: unknown = input.data[table];
    if (!Array.isArray(rows)) throw new Error(`The backup is missing its ${table} records.`);
    const idColumn = table === "user_preferences" ? "key" : table === "achievements" ? "achievement_key" : "id";
    const ids = new Set<string>();
    data[table as keyof typeof TABLES] = rows.map((row, index) => {
      if (!isObject(row)) throw new Error(`Invalid ${table} record at row ${index + 1}.`);
      const clean: Record<string, unknown> = {};
      for (const column of columns) {
        if (Object.hasOwn(row, column)) clean[column] = row[column];
      }
      const id = clean[idColumn];
      if (typeof id !== "string" || id.length === 0 || id.length > 200 || ids.has(id)) {
        throw new Error(`Invalid or duplicate identifier in ${table}.`);
      }
      ids.add(id);
      return clean;
    });
    keyFor[table] = ids;
  }

  const has = (table: string, id: unknown, nullable = false) => nullable && id === null || typeof id === "string" && keyFor[table]?.has(id);
  const requireRefs = (table: keyof typeof TABLES, field: string, target: string, nullable = false) => {
    for (const row of data[table]) if (!has(target, row[field], nullable)) throw new Error(`A ${table} record refers to a missing ${target} record.`);
  };
  requireRefs("routine_exercises", "routine_id", "routines");
  requireRefs("routine_exercises", "exercise_id", "exercises");
  requireRefs("workouts", "routine_id", "routines", true);
  requireRefs("workout_exercises", "workout_id", "workouts");
  requireRefs("workout_exercises", "exercise_id", "exercises", true);
  requireRefs("sets", "workout_exercise_id", "workout_exercises");

  if (data.workouts.filter((row) => row.status === "active").length > 1) throw new Error("The backup contains more than one active workout.");
  return {
    data,
    preview: { exportedAt, exerciseCount: data.exercises.length, routineCount: data.routines.length, workoutCount: data.workouts.length, setCount: data.sets.length },
  };
}

export function inspectBackup(text: string): { data: BackupData; preview: BackupPreview } {
  if (text.length > 20 * 1024 * 1024) throw new Error("This backup is larger than the 20 MB import limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("The selected file is not valid JSON."); }
  return validateBackup(parsed);
}

export async function restoreBackup(db: SQLiteDatabase, contents: string): Promise<void> {
  const { data } = inspectBackup(contents);
  await db.withTransactionAsync(async () => {
    await db.execAsync(`DELETE FROM sets; DELETE FROM workout_exercises; DELETE FROM workouts; DELETE FROM routine_exercises; DELETE FROM routines; DELETE FROM achievements; DELETE FROM user_preferences; DELETE FROM exercises;`);
    for (const table of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
      const columns = TABLES[table] as readonly string[];
      for (const row of data[table]) {
        const values = columns.map((column) => row[column] ?? null);
        const names = columns.join(", ");
        const slots = columns.map(() => "?").join(", ");
        await db.runAsync(`INSERT INTO ${table} (${names}) VALUES (${slots})`, ...values as (string | number | null)[]);
      }
    }
  });
}
