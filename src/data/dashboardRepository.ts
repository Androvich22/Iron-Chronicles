import type { SQLiteDatabase } from "expo-sqlite";

export type DashboardOverview = {
  completedWorkouts: number;
  workoutsThisWeek: number;
  workoutsThisMonth: number;
  recordedVolumeKg: number;
  distinctMovements: number;
  completedDaysThisWeek: number[];
  recentWorkouts: { id: string; startedAt: string; completedAt: string; exerciseCount: number; setCount: number }[];
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

export async function getDashboardOverview(db: SQLiteDatabase): Promise<DashboardOverview> {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStartIso = monday.toISOString();
  const monthStartIso = monthStart.toISOString();

  const [totals, volume, movementCount, recent, weekRows] = await Promise.all([
    db.getFirstAsync<{ completed: number; this_week: number; this_month: number }>(
      `SELECT COUNT(*) AS completed,
        SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END) AS this_week,
        SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END) AS this_month
       FROM workouts WHERE status = 'completed'`, weekStartIso, monthStartIso,
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(s.load_kg * s.repetitions) AS total
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE w.status = 'completed' AND s.is_completed = 1 AND s.set_type = 'working'
         AND we.is_omitted = 0 AND s.load_kg IS NOT NULL AND we.load_type_snapshot = 'external'`,
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(DISTINCT we.exercise_id) AS total
       FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
       WHERE w.status = 'completed' AND we.is_omitted = 0 AND we.exercise_id IS NOT NULL`,
    ),
    db.getAllAsync<{ id: string; started_at: string; completed_at: string; exercise_count: number; set_count: number }>(
      `SELECT w.id, w.started_at, w.completed_at,
        COUNT(DISTINCT we.id) AS exercise_count,
        COUNT(DISTINCT CASE WHEN s.is_completed = 1 THEN s.id END) AS set_count
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id = w.id AND we.is_omitted = 0
       LEFT JOIN sets s ON s.workout_exercise_id = we.id
       WHERE w.status = 'completed' GROUP BY w.id ORDER BY w.completed_at DESC LIMIT 3`,
    ),
    db.getAllAsync<{ started_at: string }>(
      "SELECT started_at FROM workouts WHERE status = 'completed' AND started_at >= ? ORDER BY started_at",
      weekStartIso,
    ),
  ]);

  const activeWeekDates = new Set(weekRows.map((row) => dateKey(new Date(row.started_at))));
  const completedDaysThisWeek = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    return activeWeekDates.has(dateKey(day)) ? index : -1;
  }).filter((index) => index >= 0);

  return {
    completedWorkouts: totals?.completed ?? 0,
    workoutsThisWeek: totals?.this_week ?? 0,
    workoutsThisMonth: totals?.this_month ?? 0,
    recordedVolumeKg: volume?.total ?? 0,
    distinctMovements: movementCount?.total ?? 0,
    completedDaysThisWeek,
    recentWorkouts: recent.map((workout) => ({ id: workout.id, startedAt: workout.started_at, completedAt: workout.completed_at, exerciseCount: workout.exercise_count, setCount: workout.set_count })),
  };
}
