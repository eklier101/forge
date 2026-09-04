import { useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { colors } from "../theme/colors";

type Point = { date: string; value: number };

export type ChartVariant = "bar" | "line";

type Props = {
  points: Point[];
  height?: number;
  variant?: ChartVariant;
  formatValue?: (n: number) => string;
  selectedDate?: string | null;
  onSelect?: (point: Point) => void;
};

/** Sparkline for metric history — bars for daily totals, lines for trends. */
export function MetricSparkline({
  points,
  height = 88,
  variant = "bar",
  formatValue,
  selectedDate,
  onSelect,
}: Props) {
  const { series, min, max } = useMemo(() => {
    const vals = points.map((p) => p.value).filter((v) => Number.isFinite(v));
    if (!vals.length) return { series: [] as Point[], min: 0, max: 0 };
    return { series: points, min: Math.min(...vals), max: Math.max(...vals) };
  }, [points]);

  const [width, setWidth] = useState(0);

  if (!series.length) {
    return <Text style={styles.empty}>No points to chart yet.</Text>;
  }

  const fmt = formatValue ?? ((n: number) => String(Math.round(n)));
  const span = max - min || 1;
  const selected = selectedDate ? series.find((p) => p.date === selectedDate) : null;

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.chart, { height }]} onLayout={onLayout}>
        {variant === "line" ? (
          <LineChart
            series={series}
            width={width}
            height={height}
            min={min}
            span={span}
            selectedDate={selectedDate}
            onSelect={onSelect}
          />
        ) : (
          <BarChart series={series} min={min} span={span} selectedDate={selectedDate} onSelect={onSelect} />
        )}
      </View>
      {selected ? (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedDate}>{selected.date}</Text>
          <Text style={styles.selectedVal}>{fmt(selected.value)}</Text>
        </View>
      ) : (
        <Text style={styles.tapHint}>Tap a bar or dot for that day’s value</Text>
      )}
      <View style={styles.axis}>
        <Text style={styles.axisText}>{fmt(min)}</Text>
        <Text style={styles.axisText}>{fmt(max)}</Text>
      </View>
      <Text style={styles.range}>
        {series[0]?.date.slice(5)} → {series[series.length - 1]?.date.slice(5)} · {series.length} days
      </Text>
    </View>
  );
}

function BarChart({
  series,
  min,
  span,
  selectedDate,
  onSelect,
}: {
  series: Point[];
  min: number;
  span: number;
  selectedDate?: string | null;
  onSelect?: (point: Point) => void;
}) {
  return (
    <View style={styles.barRow}>
      {series.map((p) => {
        const pct = Math.max(0.08, (p.value - min) / span);
        const on = selectedDate === p.date;
        return (
          <Pressable
            key={p.date}
            style={styles.col}
            onPress={() => onSelect?.(p)}
            accessibilityLabel={`${p.date} ${p.value}`}
          >
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { height: `${Math.round(pct * 100)}%` },
                  on && styles.barOn,
                ]}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function LineChart({
  series,
  width,
  height,
  min,
  span,
  selectedDate,
  onSelect,
}: {
  series: Point[];
  width: number;
  height: number;
  min: number;
  span: number;
  selectedDate?: string | null;
  onSelect?: (point: Point) => void;
}) {
  const padX = 8;
  const padY = 10;
  const innerW = Math.max(0, width - padX * 2);
  const innerH = Math.max(0, height - padY * 2);
  const n = series.length;

  const coords = series.map((p, i) => {
    const x = n === 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW;
    const y = padY + innerH - ((p.value - min) / span) * innerH;
    return { x, y, point: p };
  });

  const poly = coords.map((c) => `${c.x},${c.y}`).join(" ");

  if (width < 8) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Svg width={width} height={height}>
        <Polyline
          points={poly}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((c) => (
          <Circle
            key={c.point.date}
            cx={c.x}
            cy={c.y}
            r={selectedDate === c.point.date ? 5.5 : 3.2}
            fill={selectedDate === c.point.date ? colors.text : colors.accent}
          />
        ))}
      </Svg>
      {/* Invisible hit targets over each point */}
      {coords.map((c) => (
        <Pressable
          key={`hit-${c.point.date}`}
          style={[styles.hit, { left: c.x - 14, top: c.y - 14 }]}
          onPress={() => onSelect?.(c.point)}
          accessibilityLabel={`${c.point.date} ${c.point.value}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  empty: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  chart: {
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 4,
    overflow: "hidden",
  },
  barRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  col: { flex: 1, height: "100%", justifyContent: "flex-end" },
  barTrack: { flex: 1, justifyContent: "flex-end" },
  bar: {
    width: "100%",
    minHeight: 3,
    borderRadius: 3,
    backgroundColor: colors.accent,
    opacity: 0.75,
  },
  barOn: { opacity: 1, backgroundColor: colors.text },
  hit: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  selectedBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accentDim,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedDate: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  selectedVal: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 16 },
  tapHint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 11 },
  range: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 11 },
});
