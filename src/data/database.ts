import type { SQLiteDatabase } from "expo-sqlite";
import { BUILT_IN_EXERCISES } from "./exerciseCatalog";

const DATABASE_VERSION = 5;

async function seedBuiltInExercises(db: SQLiteDatabase) {
  const now = new Date().toISOString();
  for (const exercise of BUILT_IN_EXERCISES) {
    await db.runAsync(
      `INSERT INTO exercises (id, name, source, primary_muscle_group, secondary_muscle_groups_json, equipment, load_type, tracking_type, instructions, created_at, updated_at)
       VALUES (?, ?, 'built_in', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET instructions = excluded.instructions, updated_at = excluded.updated_at
       WHERE exercises.source = 'built_in'`,
      exercise.id,
      exercise.name,
      exercise.primaryMuscleGroup,
      JSON.stringify(exercise.secondaryMuscleGroups),
      exercise.equipment,
      exercise.loadType,
      exercise.trackingType,
      exercise.instructions,
      now,
      now,
    );
  }
}

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let version = versionRow?.user_version ?? 0;

  if (version > DATABASE_VERSION) {
    throw new Error(`Database version ${version} is newer than this app supports.`);
  }

  if (version === 0) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE exercises (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('built_in', 'user')),
          primary_muscle_group TEXT NOT NULL,
          secondary_muscle_groups_json TEXT NOT NULL DEFAULT '[]',
          equipment TEXT NOT NULL,
          load_type TEXT NOT NULL CHECK (load_type IN ('external', 'bodyweight', 'bodyweight_added_load')),
          tracking_type TEXT NOT NULL CHECK (tracking_type IN ('loaded_reps', 'bodyweight_reps')),
          instructions TEXT,
          is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX exercises_name_idx ON exercises(name COLLATE NOCASE);
        CREATE INDEX exercises_muscle_idx ON exercises(primary_muscle_group);
        CREATE INDEX exercises_equipment_idx ON exercises(equipment);

        CREATE TABLE routines (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE routine_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
          exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
          order_index INTEGER NOT NULL CHECK (order_index >= 0),
          target_set_count INTEGER NOT NULL CHECK (target_set_count > 0),
          target_rep_min INTEGER NOT NULL CHECK (target_rep_min > 0),
          target_rep_max INTEGER NOT NULL CHECK (target_rep_max >= target_rep_min),
          target_load_kg REAL CHECK (target_load_kg IS NULL OR target_load_kg >= 0),
          rest_seconds INTEGER CHECK (rest_seconds IS NULL OR rest_seconds > 0),
          note TEXT,
          UNIQUE (routine_id, order_index)
        );

        CREATE TABLE workouts (
          id TEXT PRIMARY KEY NOT NULL,
          routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL,
          routine_name_snapshot TEXT,
          status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
          started_at TEXT NOT NULL,
          completed_at TEXT,
          rest_timer_end_at TEXT,
          rest_timer_duration_seconds INTEGER NOT NULL DEFAULT 90 CHECK (rest_timer_duration_seconds > 0),
          notes TEXT,
          CHECK ((status = 'active' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL))
        );
        CREATE UNIQUE INDEX one_active_workout_idx ON workouts(status) WHERE status = 'active';

        CREATE TABLE workout_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
          exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
          exercise_name_snapshot TEXT NOT NULL,
          primary_muscle_group_snapshot TEXT NOT NULL,
          equipment_snapshot TEXT NOT NULL,
          load_type_snapshot TEXT NOT NULL,
          tracking_type_snapshot TEXT NOT NULL,
          order_index INTEGER NOT NULL CHECK (order_index >= 0),
          target_set_count INTEGER,
          target_rep_min INTEGER,
          target_rep_max INTEGER,
          is_omitted INTEGER NOT NULL DEFAULT 0 CHECK (is_omitted IN (0, 1)),
          UNIQUE (workout_id, order_index)
        );

        CREATE TABLE sets (
          id TEXT PRIMARY KEY NOT NULL,
          workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
          order_index INTEGER NOT NULL CHECK (order_index >= 0),
          set_type TEXT NOT NULL CHECK (set_type IN ('warm_up', 'working')),
          repetitions INTEGER CHECK (repetitions IS NULL OR repetitions > 0),
          load_kg REAL CHECK (load_kg IS NULL OR load_kg >= 0),
          assistance_kg REAL CHECK (assistance_kg IS NULL OR assistance_kg > 0),
          note TEXT,
          is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
          completed_at TEXT,
          UNIQUE (workout_exercise_id, order_index),
          CHECK ((is_completed = 0 AND completed_at IS NULL) OR (is_completed = 1 AND completed_at IS NOT NULL AND repetitions IS NOT NULL))
        );

        CREATE TABLE achievements (
          id TEXT PRIMARY KEY NOT NULL,
          achievement_key TEXT NOT NULL UNIQUE,
          earned_at TEXT NOT NULL
        );

        CREATE TABLE user_preferences (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await seedBuiltInExercises(db);
      await db.execAsync("PRAGMA user_version = 1");
    });
    version = 1;
  }

  if (version === 1) {
    await db.withTransactionAsync(async () => {
      await seedBuiltInExercises(db);
      await db.execAsync("PRAGMA user_version = 2");
    });
    version = 2;
  }

  if (version === 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE sets_new (
          id TEXT PRIMARY KEY NOT NULL,
          workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
          order_index INTEGER NOT NULL CHECK (order_index >= 0),
          set_type TEXT NOT NULL CHECK (set_type IN ('warm_up', 'working')),
          repetitions INTEGER CHECK (repetitions IS NULL OR repetitions > 0),
          load_kg REAL CHECK (load_kg IS NULL OR load_kg >= 0),
          assistance_kg REAL CHECK (assistance_kg IS NULL OR assistance_kg > 0),
          note TEXT,
          is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
          completed_at TEXT,
          UNIQUE (workout_exercise_id, order_index),
          CHECK ((is_completed = 0 AND completed_at IS NULL) OR (is_completed = 1 AND completed_at IS NOT NULL AND repetitions IS NOT NULL))
        );
        INSERT INTO sets_new (id, workout_exercise_id, order_index, set_type, repetitions, load_kg, assistance_kg, note, is_completed, completed_at)
          SELECT id, workout_exercise_id, order_index, set_type, repetitions, load_kg, assistance_kg, note, is_completed, completed_at FROM sets;
        DROP TABLE sets;
        ALTER TABLE sets_new RENAME TO sets;
        PRAGMA user_version = 3;
      `);
    });
    version = 3;
  }

  if (version === 3) {
    await db.withTransactionAsync(async () => {
      await seedBuiltInExercises(db);
      await db.execAsync("PRAGMA user_version = 4");
    });
    version = 4;
  }

  if (version === 4) {
    await db.withTransactionAsync(async () => {
      await db.execAsync("ALTER TABLE workout_exercises ADD COLUMN rest_seconds INTEGER CHECK (rest_seconds IS NULL OR rest_seconds > 0); PRAGMA user_version = 5;");
    });
    version = 5;
  }
}
