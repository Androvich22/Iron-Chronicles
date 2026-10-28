import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const C = { bg: "#101113", panel: "#191A1D", line: "#343338", gold: "#B69A68", text: "#F0E8D9", muted: "#96918A", parchment: "#D4C7AC" };

export function SectionScreen({ eyebrow, title, description, emptyTitle, emptyText }: { eyebrow: string; title: string; description: string; emptyTitle: string; emptyText: string }) {
  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.wordmark}>IRON CHRONICLES</Text><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text><Text style={s.description}>{description}</Text>
    <View style={s.panel}><View style={s.seal}><Text style={s.sealGlyph}>✦</Text></View><Text style={s.emptyTitle}>{emptyTitle}</Text><Text style={s.emptyText}>{emptyText}</Text></View>
    <Text style={s.note}>Built for steady work. Your records stay yours.</Text>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 22, paddingTop: 20, flexGrow: 1 }, wordmark: { color: C.gold, fontSize: 12, letterSpacing: 3, fontFamily: "serif", marginBottom: 35 }, eyebrow: { color: C.gold, fontSize: 10, letterSpacing: 2, marginBottom: 10 }, title: { color: C.text, fontSize: 31, fontFamily: "serif" }, description: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 320 }, panel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 24, alignItems: "center", marginTop: 32 }, seal: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: "#6B583A", justifyContent: "center", alignItems: "center", marginBottom: 16 }, sealGlyph: { color: C.gold, fontSize: 22 }, emptyTitle: { color: C.parchment, fontFamily: "serif", fontSize: 19, textAlign: "center" }, emptyText: { color: C.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 }, note: { color: "#706B64", fontSize: 11, textAlign: "center", marginTop: "auto", paddingTop: 28 } });
