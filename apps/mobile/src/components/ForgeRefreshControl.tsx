import { Platform, RefreshControl, type RefreshControlProps } from "react-native";
import { colors } from "../theme/colors";

type Props = Omit<RefreshControlProps, "tintColor" | "colors" | "progressBackgroundColor" | "progressViewOffset"> & {
  /** Safe-area / status-bar inset — Android spinner sits just below it (not under the clock). */
  topInset?: number;
};

/**
 * Shared pull-to-refresh for Forge's dark UI.
 * Pass topInset from useSafeAreaInsets().top so Android's spinner clears the status bar
 * without inventing a second huge gap (only use insets.top, not content padding).
 */
export function ForgeRefreshControl({ topInset = 0, ...props }: Props) {
  const androidOffset = Platform.OS === "android" ? Math.max(0, Math.round(topInset)) : undefined;
  return (
    <RefreshControl
      {...props}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.bgElevated}
      {...(androidOffset != null && androidOffset > 0 ? { progressViewOffset: androidOffset } : {})}
    />
  );
}
