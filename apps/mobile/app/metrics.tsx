import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MetricSparkline } from "../src/components/MetricSparkline";
import { ScreenHeader } from "../src/components/ScreenChrome";
import { getPreferences } from "../src/db/local";
import { apiFetch } from "../src/lib/api";
import { kgToLb } from "../src/lib/bodyProfile";
import { localToday } from "../src/lib/dates";
import {
  buildMetricTiles,
  formatHistoryValue,
  HISTORY_TITLES,
  type ActivityDaily,
  type HistoryMetric,
  type LatestWeight,
} from "../src/lib/metricsDisplay";
import { colors, spacing } from "../src/theme/colors";

function formatWeightLabel(weight: number, units: string | undefined, preferLb: boolean): string {
  let w = weight;
  let u = units === "kg" ? "kg" : "lb";
  if (preferLb && u === "kg") {
    w = Math.round(kgToLb(w) * 10) / 10;
    u = "lb";
  } else if (!preferLb && u === "lb") {
    w = Math.round((w / 2.20462) * 10) / 10;
    u = "kg";
  } else {
    w = Math.round(w * 10) / 10;
  }
  return `${w} ${u}`;
}

export default function MetricsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activity, setActivity] = useState<ActivityDaily | null>(null);
  const [latestWeight, setLatestWeight] = useState<LatestWeight | null>(null);
  const [weightLabel, setWeightLabel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [historyMetric, setHistoryMetric] = useState<HistoryMetric | null>(null);
  const [historyPoints, setHistoryPoints] = useState<{ date: string; value: number; units?: string }[]>(
    [],
  );
  const [historyBusy, setHistoryBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const metrics = await apiFetch<{
        garmin: ActivityDaily | null;
        latestWeight: LatestWeight | null;
      }>(`/metrics/today?date=${localToday()}`);
      setActivity(metrics.garmin);
      if (metrics.latestWeight?.weight != null) {
        setLatestWeight(metrics.latestWeight);
        const prefs = await getPreferences();
        setWeightLabel(
          formatWeightLabel(metrics.latestWeight.weight, metrics.latestWeight.units, prefs.units !== "kg"),
        );
      } else {
        setLatestWeight(null);
        setWeightLabel(null);
      }
    } catch {
      /* keep last */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function openHistory(metric: HistoryMetric) {
    setHistoryMetric(metric);
    setHistoryBusy(true);
    setHistoryPoints([]);
    try {
      const res = await apiFetch<{ points: { date: string; value: number; units?: string }[] }>(
        `/metrics/history?metric=${metric}&days=30`,
      );
      setHistoryPoints(res.points ?? []);
    } catch {
      setHistoryPoints([]);
    } finally {
      setHistoryBusy(false);
    }
  }

  const tiles = buildMetricTiles(activity, weightLabel, latestWeight);
  const activityTiles = tiles.filter((t) => t.section === "activity");
  const bodyTiles = tiles.filter((t) => t.section === "body");

  function renderGrid(items: typeof tiles) {
    return (
      <View style={styles.grid}>
        {items.map((t) => (
          <Pressable key={t.key} style={styles.card} onPress={() => void openHistory(t.key)}>
            <Text style={styles.label}>{t.label}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {t.value}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 48 + Math.max(insets.bottom, 0) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <ScreenHeader
          title="All stats"
          subtitle="Tap any metric for 30-day history"
          backLabel="Home"
          onBack={() => router.back()}
        />

        <Text style={styles.section}>Activity & recovery</Text>
        {renderGrid(activityTiles)}

        <Text style={styles.section}>Body composition</Text>
        {renderGrid(bodyTiles)}
      </ScrollView>

      <Modal
        visible={historyMetric != null}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryMetric(null)}
      >
        <Pressable style={styles.histBackdrop} onPress={() => setHistoryMetric(null)}>
          <View style={styles.histCard}>
            <Text style={styles.histTitle}>
              {historyMetric ? HISTORY_TITLES[historyMetric] : "Metric"} · last 30 days
            </Text>
            {historyBusy ? (
              <ActivityIndicator color={colors.accent} />
            ) : historyPoints.length === 0 ? (
              <Text style={styles.histEmpty}>No history yet — sync Garmin, Renpho, or Health Connect.</Text>
            ) : (
              <>
                <MetricSparkline
                  points={historyPoints}
                  formatValue={(n) =>
                    historyMetric
                      ? formatHistoryValue(historyMetric, n, historyPoints[0]?.units)
                      : String(n)
                  }
                />
                <ScrollView style={{ maxHeight: 220 }}>
                  {historyPoints.map((p) => (
                    <View key={p.date} style={styles.histRow}>
                      <Text style={styles.histDate}>{p.date}</Text>
                      <Text style={styles.histVal}>
                        {historyMetric ? formatHistoryValue(historyMetric, p.value, p.units) : p.value}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  section: {
    color: colors.textMuted,
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "47.5%",
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 72,
  },
  label: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  value: {
    color: colors.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    marginTop: 6,
  },
  histBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  histCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  histTitle: {
    color: colors.text,
    fontFamily: "Outfit_700Bold",
    fontSize: 17,
  },
  histEmpty: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 14 },
  histRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  histDate: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  histVal: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 14 },
});
