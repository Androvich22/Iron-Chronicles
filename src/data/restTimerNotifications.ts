import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance, SchedulableTriggerInputTypes } from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";

const CHANNEL_ID = "rest-timer";
const PREFERENCE_KEY = "rest_timer_notification_id";

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Rest timer",
    description: "Alerts when your between-set rest timer ends.",
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 120, 220],
    lightColor: "#B69A68",
  });
}

export async function getRestTimerAlertPermission() {
  await ensureChannel();
  return Notifications.getPermissionsAsync();
}

export async function requestRestTimerAlertPermission() {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return current;
  return Notifications.requestPermissionsAsync();
}

export async function cancelRestTimerAlert(db: SQLiteDatabase) {
  const stored = await db.getFirstAsync<{ value: string }>("SELECT value FROM user_preferences WHERE key = ?", PREFERENCE_KEY);
  if (stored?.value) {
    try { await Notifications.cancelScheduledNotificationAsync(stored.value); } catch { /* The timer may already have fired or been cleared by Android. */ }
  }
  await db.runAsync("DELETE FROM user_preferences WHERE key = ?", PREFERENCE_KEY);
}

export async function scheduleRestTimerAlert(db: SQLiteDatabase, endAt: string): Promise<boolean> {
  await cancelRestTimerAlert(db);
  if (new Date(endAt).getTime() <= Date.now()) return false;
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return false;
    await ensureChannel();
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Rest complete",
        body: "Your next set is ready when you are.",
        sound: "default",
        color: "#B69A68",
      },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: new Date(endAt), channelId: CHANNEL_ID },
    });
    await db.runAsync("INSERT OR REPLACE INTO user_preferences (key, value, updated_at) VALUES (?, ?, ?)", PREFERENCE_KEY, identifier, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}
