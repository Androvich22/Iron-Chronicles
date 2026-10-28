import { Image } from "react-native";

export function BrandMark({ size = 25 }: { size?: number }) {
  return <Image source={require("../../assets/images/brand-mark.png")} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}
