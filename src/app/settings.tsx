import { File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtmosphereBackground } from "../components/AtmosphereBackground";
import { createBackup, inspectBackup, restoreBackup, type BackupPreview } from "../data/backupRepository";
import { getRestTimerAlertPermission, requestRestTimerAlertPermission, scheduleRestTimerAlert } from "../data/restTimerNotifications";
import { getActiveWorkout } from "../data/workoutRepository";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", ember: "#9A4932", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState<"export" | "import" | "restore" | "permission" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; preview: BackupPreview } | null>(null);
  const [alertsGranted, setAlertsGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getRestTimerAlertPermission().then((permission) => { if (active) setAlertsGranted(permission.granted); }).catch(() => { if (active) setAlertsGranted(false); });
    return () => { active = false; };
  }, []);

  const enableTimerAlerts = async () => {
    setBusy("permission"); setError(null); setMessage(null);
    try {
      const permission = await requestRestTimerAlertPermission();
      setAlertsGranted(permission.granted);
      if (permission.granted) {
        const workout = await getActiveWorkout(db);
        if (workout?.rest_timer_end_at) await scheduleRestTimerAlert(db, workout.rest_timer_end_at);
        setMessage("Rest timer alerts are enabled. Your in-app timer works either way.");
      } else {
        setMessage(permission.canAskAgain ? "Alerts are off. The in-app timer will still work." : "Alerts are blocked for this app. You can enable them in Android Settings; the in-app timer will still work.");
      }
    } catch { setError("Notification permission could not be checked. The in-app timer will still work."); }
    finally { setBusy(null); }
  };

  const exportBackup = async () => {
    setBusy("export"); setError(null); setMessage(null);
    try {
      const contents = await createBackup(db);
      const date = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `iron-chronicles-backup-${date}.json`);
      file.create({ intermediates: true, overwrite: true });
      await file.write(contents);
      if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Save your Iron Chronicles backup" });
      setMessage("Backup prepared. Keep the exported file somewhere safe.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The backup could not be exported."); }
    finally { setBusy(null); }
  };

  const selectBackup = async () => {
    setBusy("import"); setError(null); setMessage(null); setPending(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json", "text/plain"], copyToCacheDirectory: true });
      if (result.canceled) return;
      if ((result.assets[0].size ?? 0) > 20 * 1024 * 1024) throw new Error("This backup is larger than the 20 MB import limit.");
      const contents = await new File(result.assets[0].uri).text();
      const inspected = inspectBackup(contents);
      setPending({ text: contents, preview: inspected.preview });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This backup could not be read."); }
    finally { setBusy(null); }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setBusy("restore"); setError(null); setMessage(null);
    try {
      await restoreBackup(db, pending.text);
      setPending(null);
      setMessage("Backup restored. Your local chronicle now matches the selected file.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The backup could not be restored. Your current data was kept."); }
    finally { setBusy(null); }
  };

  return <SafeAreaView style={s.safe} edges={["top"]}><AtmosphereBackground /><ScrollView contentContainerStyle={s.content}>
    <View style={s.topline}><Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Text style={s.backGlyph}>‹</Text></Pressable><Text style={s.wordmark}>IRON CHRONICLES</Text></View>
    <Text style={s.eyebrow}>THE STEWARD’S DESK</Text><Text style={s.title}>Settings & data</Text><Text style={s.description}>Your training record stays on this device. Create a backup before changing phones or clearing app storage.</Text>
    <View style={s.card}><Text style={s.cardTitle}>EXPORT YOUR RECORD</Text><Text style={s.cardCopy}>Save routines, exercises, workouts, sets, achievements, and preferences in a versioned JSON file.</Text><Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void exportBackup()} style={[s.primary, busy !== null && s.disabled]}><Text style={s.primaryText}>{busy === "export" ? "PREPARING BACKUP…" : "EXPORT BACKUP"}</Text></Pressable></View>
    <View style={s.card}><Text style={s.cardTitle}>RESTORE A BACKUP</Text><Text style={s.cardCopy}>Choose an Iron Chronicles JSON backup. You’ll review its contents before it replaces the records on this device.</Text><Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void selectBackup()} style={[s.secondary, busy !== null && s.disabled]}><Text style={s.secondaryText}>{busy === "import" ? "READING BACKUP…" : "CHOOSE BACKUP FILE"}</Text></Pressable></View>
    <View style={s.card}><Text style={s.cardTitle}>REST TIMER ALERTS</Text><Text style={s.cardCopy}>Get a local alert when rest ends while Iron Chronicles is in the background. Permission is optional.</Text><Text style={s.permissionStatus}>STATUS · {alertsGranted === null ? "CHECKING" : alertsGranted ? "ENABLED" : "OFF"}</Text><Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void enableTimerAlerts()} style={[s.secondary, busy !== null && s.disabled]}><Text style={s.secondaryText}>{busy === "permission" ? "CHECKING PERMISSION…" : alertsGranted ? "REFRESH ALERT PERMISSION" : "ENABLE REST ALERTS"}</Text></Pressable></View>
    {pending ? <View style={s.preview}><Text style={s.cardTitle}>READY TO RESTORE</Text><Text style={s.cardCopy}>Backup date: {pending.preview.exportedAt}{"\n"}{pending.preview.exerciseCount} exercises · {pending.preview.routineCount} routines{"\n"}{pending.preview.workoutCount} workouts · {pending.preview.setCount} sets</Text><Text style={s.warning}>Restoring replaces all existing local data. This cannot be undone.</Text><Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void confirmRestore()} style={[s.danger, busy !== null && s.disabled]}><Text style={s.primaryText}>{busy === "restore" ? "RESTORING…" : "REPLACE WITH THIS BACKUP"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setPending(null)} style={s.cancel}><Text style={s.cancelText}>CANCEL</Text></Pressable></View> : null}
    {busy === "restore" ? <ActivityIndicator color={C.gold} style={s.spinner} /> : null}
    {message ? <Text accessibilityRole="alert" style={s.success}>{message}</Text> : null}{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <View style={s.note}><Text style={s.noteTitle}>LOCAL BY DESIGN</Text><Text style={s.noteCopy}>Iron Chronicles has no account or cloud sync. Uninstalling the app or clearing its storage may erase this record. Keep an exported backup outside the device.</Text></View>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, paddingTop: 10, paddingBottom: 32 }, topline: { height: 42, flexDirection: "row", alignItems: "center", marginBottom: 28 }, back: { width: 36, height: 36, borderWidth: 1, borderColor: C.line, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 }, backGlyph: { color: C.parchment, fontSize: 25, marginTop: -3 }, wordmark: { color: C.gold, fontFamily: "serif", fontSize: 11, letterSpacing: 2.3 }, eyebrow: { color: C.gold, letterSpacing: 2, fontSize: 9, marginBottom: 8 }, title: { color: C.text, fontFamily: "serif", fontSize: 29 }, description: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 22 }, card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 12 }, cardTitle: { color: C.parchment, fontSize: 11, letterSpacing: 1.1, fontWeight: "700" }, cardCopy: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }, permissionStatus: { color: C.gold, fontSize: 9, letterSpacing: 1, marginTop: 13 }, primary: { height: 47, alignItems: "center", justifyContent: "center", backgroundColor: C.ember, borderColor: "#B2674A", borderWidth: 1, borderRadius: 8, marginTop: 15 }, primaryText: { color: "#FFF5E7", fontSize: 10, fontWeight: "700", letterSpacing: 1.1 }, secondary: { height: 45, alignItems: "center", justifyContent: "center", borderColor: "#65563E", borderWidth: 1, borderRadius: 8, marginTop: 15 }, secondaryText: { color: C.gold, fontSize: 10, fontWeight: "700", letterSpacing: 1 }, preview: { backgroundColor: "#211E1A", borderColor: "#806A45", borderWidth: 1, borderRadius: 10, padding: 16, marginTop: 6 }, warning: { color: "#E0AA8B", fontSize: 11, lineHeight: 16, marginTop: 13 }, danger: { height: 47, alignItems: "center", justifyContent: "center", backgroundColor: "#713528", borderColor: "#AB6044", borderWidth: 1, borderRadius: 8, marginTop: 14 }, cancel: { minHeight: 40, alignItems: "center", justifyContent: "center", marginTop: 4 }, cancelText: { color: C.muted, fontSize: 10, letterSpacing: 1 }, note: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 22, paddingTop: 17 }, noteTitle: { color: C.gold, fontSize: 9, letterSpacing: 1.5 }, noteCopy: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }, success: { color: "#B8D3A2", fontSize: 12, lineHeight: 18, marginTop: 14 }, error: { color: "#D88A73", fontSize: 12, lineHeight: 18, marginTop: 14 }, spinner: { marginTop: 14 }, disabled: { opacity: 0.5 } });
