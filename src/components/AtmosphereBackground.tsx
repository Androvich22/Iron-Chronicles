import { BlurTargetView, BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useRef, type ComponentRef } from "react";
import { StyleSheet, View } from "react-native";

export type AtmosphereScene = "hall" | "forge" | "armory" | "chronicle";

const SCENES = {
  hall: require("../../assets/images/backgrounds/hall.webp"),
  forge: require("../../assets/images/backgrounds/forge.webp"),
  armory: require("../../assets/images/backgrounds/armory.webp"),
  chronicle: require("../../assets/images/backgrounds/chronicle.webp"),
};

/** Full-screen, low-contrast scene art kept behind the screen's readable content. */
export function AtmosphereBackground({ scene = "hall" }: { scene?: AtmosphereScene }) {
  const blurTarget = useRef<ComponentRef<typeof View> | null>(null);

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <BlurTargetView ref={blurTarget} style={StyleSheet.absoluteFill}>
        <Image source={SCENES[scene]} contentFit="cover" contentPosition="center" style={styles.artwork} />
      </BlurTargetView>
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={16}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.62 },
  tint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(30, 25, 19, 0.10)" },
});
