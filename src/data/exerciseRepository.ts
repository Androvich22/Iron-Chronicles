import type { SQLiteDatabase } from "expo-sqlite";
import type { ExerciseLoadType, ExerciseTrackingType } from "./exerciseCatalog";

export type Exercise = {
  id: string;
  name: string;
  source: "built_in" | "user";
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string;
  loadType: ExerciseLoadType;
  trackingType: ExerciseTrackingType;
  instructions: string | null;
};

type ExerciseRow = Omit<Exercise, "secondaryMuscleGroups" | "primaryMuscleGroup" | "loadType" | "trackingType"> & { secondary_muscle_groups_json: string; primary_muscle_group: string; load_type: ExerciseLoadType; tracking_type: ExerciseTrackingType };

export type ExerciseFilters = { muscleGroup?: string; equipment?: string };

export async function searchExercises(db: SQLiteDatabase, searchText = "", filters: ExerciseFilters = {}): Promise<Exercise[]> {
  const needle = `%${searchText.trim()}%`;
  const muscleGroup = filters.muscleGroup ?? "";
  const equipment = filters.equipment ?? "";
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT id, name, source, primary_muscle_group, secondary_muscle_groups_json, equipment, load_type, tracking_type, instructions
     FROM exercises
     WHERE is_archived = 0
       AND (? = '%%' OR name LIKE ? COLLATE NOCASE OR primary_muscle_group LIKE ? COLLATE NOCASE OR secondary_muscle_groups_json LIKE ? OR equipment LIKE ? COLLATE NOCASE)
       AND (? = '' OR primary_muscle_group = ? COLLATE NOCASE OR secondary_muscle_groups_json LIKE ?)
       AND (? = '' OR equipment = ? COLLATE NOCASE)
     ORDER BY name COLLATE NOCASE`,
    needle,
    needle,
    needle,
    needle,
    needle,
    muscleGroup,
    muscleGroup,
    `%"${muscleGroup}"%`,
    equipment,
    equipment,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    source: row.source,
    primaryMuscleGroup: row.primary_muscle_group,
    secondaryMuscleGroups: JSON.parse(row.secondary_muscle_groups_json) as string[],
    equipment: row.equipment,
    loadType: row.load_type,
    trackingType: row.tracking_type,
    instructions: row.instructions,
  }));
}

export async function listExerciseFilters(db: SQLiteDatabase) {
  const [muscles, equipment] = await Promise.all([
    db.getAllAsync<{ primary_muscle_group: string; secondary_muscle_groups_json: string }>("SELECT primary_muscle_group, secondary_muscle_groups_json FROM exercises WHERE is_archived = 0"),
    db.getAllAsync<{ value: string }>("SELECT DISTINCT equipment AS value FROM exercises WHERE is_archived = 0 ORDER BY value COLLATE NOCASE"),
  ]);
  const muscleGroups = new Set<string>();
  for (const row of muscles) {
    muscleGroups.add(row.primary_muscle_group);
    for (const secondary of JSON.parse(row.secondary_muscle_groups_json) as string[]) muscleGroups.add(secondary);
  }
  return { muscleGroups: [...muscleGroups].sort((a, b) => a.localeCompare(b)), equipment: equipment.map((row) => row.value) };
}

function makeId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

export type ExerciseInput = Omit<Exercise, "id" | "source">;

function validateExercise(input: ExerciseInput) {
  if (!input.name.trim() || !input.primaryMuscleGroup.trim() || !input.equipment.trim()) throw new Error("Name, primary muscle group, and equipment are required.");
}

export async function saveCustomExercise(db: SQLiteDatabase, exerciseId: string | null, input: ExerciseInput) {
  validateExercise(input);
  const now = new Date().toISOString();
  const id = exerciseId ?? makeId("custom-exercise");
  if (exerciseId) {
    const result = await db.runAsync(
      `UPDATE exercises SET name = ?, primary_muscle_group = ?, secondary_muscle_groups_json = ?, equipment = ?, load_type = ?, tracking_type = ?, instructions = ?, updated_at = ?
       WHERE id = ? AND source = 'user' AND is_archived = 0`,
      input.name.trim(), input.primaryMuscleGroup.trim(), JSON.stringify(input.secondaryMuscleGroups), input.equipment.trim(), input.loadType, input.trackingType, input.instructions?.trim() || null, now, id,
    );
    if (result.changes === 0) throw new Error("Only active custom exercises can be edited.");
  } else {
    await db.runAsync(
      `INSERT INTO exercises (id, name, source, primary_muscle_group, secondary_muscle_groups_json, equipment, load_type, tracking_type, instructions, created_at, updated_at)
       VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, input.name.trim(), input.primaryMuscleGroup.trim(), JSON.stringify(input.secondaryMuscleGroups), input.equipment.trim(), input.loadType, input.trackingType, input.instructions?.trim() || null, now, now,
    );
  }
  return id;
}

export async function archiveCustomExercise(db: SQLiteDatabase, exerciseId: string) {
  const result = await db.runAsync("UPDATE exercises SET is_archived = 1, updated_at = ? WHERE id = ? AND source = 'user' AND is_archived = 0", new Date().toISOString(), exerciseId);
  if (result.changes === 0) throw new Error("Only active custom exercises can be archived.");
}
