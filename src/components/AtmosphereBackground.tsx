import { Image, StyleSheet, View } from "react-native";

/** Fading castle artwork cropped from the supplied Iron Chronicles design reference. */
export function AtmosphereBackground() {
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <Image
        source={require("../../assets/images/chronicle-atmosphere.png")}
        resizeMode="cover"
        fadeDuration={0}
        style={styles.artwork}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { position: "absolute", top: 0, left: 0, right: 0, width: "100%", height: 330 },
});
