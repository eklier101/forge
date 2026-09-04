import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { armRestAlarm, disarmRestAlarm, fireRestAlarm } from "../lib/notifications";
import { colors, spacing } from "../theme/colors";

type Props = {
  seconds: number;
  /** Bump to force a fresh auto-start cycle after a set. */
  restartToken?: number;
  autoStart?: boolean;
  label?: string;
  /** Called when user adjusts duration (±) so session can keep the new default. */
  onDurationChange?: (seconds: number) => void;
  onComplete?: () => void;
};

export function RestTimer({
  seconds,
  restartToken = 0,
  autoStart = false,
  label = "Rest timer",
  onDurationChange,
  onComplete,
}: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endAt = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const durationRef = useRef(seconds);
  onCompleteRef.current = onComplete;
  durationRef.current = seconds;

  useEffect(() => {
    setRemaining(seconds);
    endAt.current = null;
    if (autoStart && seconds > 0) {
      endAt.current = Date.now() + seconds * 1000;
      setRunning(true);
    } else {
      setRunning(false);
      void disarmRestAlarm();
    }
  }, [seconds, restartToken, autoStart]);

  useEffect(() => {
    if (!running) {
      return;
    }
    const secs = endAt.current
      ? Math.max(0.2, (endAt.current - Date.now()) / 1000)
      : remaining;
    void armRestAlarm(secs);
    const id = setInterval(() => {
      if (!endAt.current) return;
      const next = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) {
        setRunning(false);
        endAt.current = null;
        void fireRestAlarm();
        onCompleteRef.current?.();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, label]);

  function start() {
    endAt.current = Date.now() + remaining * 1000;
    setRunning(true);
  }

  function pause() {
    if (endAt.current) {
      setRemaining(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)));
    }
    setRunning(false);
    endAt.current = null;
    void disarmRestAlarm();
  }

  function reset() {
    setRunning(false);
    endAt.current = null;
    setRemaining(durationRef.current);
    void disarmRestAlarm();
  }

  function adjust(delta: number) {
    const nextRem = Math.max(5, remaining + delta);
    setRemaining(nextRem);
    if (running) {
      endAt.current = Date.now() + nextRem * 1000;
      void armRestAlarm(nextRem);
    }
    const nextDur = Math.min(600, Math.max(15, durationRef.current + delta));
    durationRef.current = nextDur;
    onDurationChange?.(nextDur);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const active = running || remaining < seconds;

  return (
    <View style={[styles.wrap, active && styles.wrapActive]}>
      <Text style={styles.label}>{running ? "Resting" : label}</Text>
      <Text style={styles.time}>
        {mm}:{ss}
      </Text>
      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.ghost]} onPress={() => adjust(-15)}>
          <Text style={[styles.btnText, styles.ghostText]}>−15s</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.ghost]} onPress={() => adjust(15)}>
          <Text style={[styles.btnText, styles.ghostText]}>+15s</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.ghost]} onPress={() => adjust(30)}>
          <Text style={[styles.btnText, styles.ghostText]}>+30s</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={running ? pause : start}>
          <Text style={styles.btnText}>{running ? "Pause" : "Start"}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.ghost]} onPress={reset}>
          <Text style={[styles.btnText, styles.ghostText]}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  wrapActive: { borderColor: colors.accentDim },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: "Outfit_700Bold",
  },
  time: {
    color: colors.accent,
    fontSize: 48,
    fontFamily: "SpaceGrotesk_700Bold",
    fontVariant: ["tabular-nums"],
  },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  btn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  ghost: { backgroundColor: colors.bgSoft },
  btnText: { color: colors.bg, fontFamily: "Outfit_700Bold" },
  ghostText: { color: colors.text },
});
