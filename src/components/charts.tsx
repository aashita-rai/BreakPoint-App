import { useState } from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type ChartPoint = {
  x: number;
  y: number;
  /** Shown in the readout when this point is selected, e.g. "Rep 4 · 0:12". */
  label: string;
};

type ChartProps = {
  points: ChartPoint[];
  /** Formats a y value for the readout and axis ticks. */
  formatY: (v: number) => string;
  formatX: (v: number) => string;
  /** Axis titles, e.g. xLabel "Rep number", yLabel "Seconds per rep". */
  xLabel?: string;
  yLabel?: string;
  /** x position where fatigue starts; shades everything after it. */
  markerX?: number | null;
  height?: number;
  interactive?: boolean;
};

type Pad = { top: number; right: number; bottom: number; left: number };

/** Room for tick labels, plus extra room when there are axis titles. */
const padFor = (xLabel?: string, yLabel?: string): Pad => ({
  top: 18,
  right: 8,
  bottom: xLabel ? 40 : 22,
  left: yLabel ? 52 : 34,
});

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function useChartFrame(height: number, pad: Pad) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  return { width, setWidth, plotW, plotH };
}

/** Tap or drag across the chart to pick the nearest point. */
function useSelection(pointsX: number[], interactive: boolean) {
  const [selected, setSelected] = useState<number | null>(null);
  const pick = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    let best = 0;
    pointsX.forEach((px, i) => {
      if (Math.abs(px - x) < Math.abs(pointsX[best] - x)) best = i;
    });
    setSelected(pointsX.length ? best : null);
  };
  const handlers = interactive
    ? {
        onStartShouldSetResponder: () => true,
        onResponderGrant: pick,
        onResponderMove: pick,
        onResponderTerminationRequest: () => true,
      }
    : {};
  return { selected, handlers };
}

function Readout({ point, formatY, interactive }: { point?: ChartPoint; formatY: (v: number) => string; interactive: boolean }) {
  if (!interactive) return null;
  return (
    <View style={styles.readout}>
      {point ? (
        <ThemedText type="small">
          <ThemedText type="smallBold">{formatY(point.y)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {'  '}
            {point.label}
          </ThemedText>
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Tap or drag on the chart to see each point
        </ThemedText>
      )}
    </View>
  );
}

/** Gridlines, y tick labels and the two axis titles. */
function Axes({
  yTicks,
  yScale,
  plotW,
  plotH,
  height,
  pad,
  formatY,
  xLabel,
  yLabel,
}: {
  yTicks: number[];
  yScale: (v: number) => number;
  plotW: number;
  plotH: number;
  height: number;
  pad: Pad;
  formatY: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
}) {
  const theme = useTheme();
  const midY = pad.top + plotH / 2;
  return (
    <>
      {yTicks.map((t) => (
        <Line key={`g${t}`} x1={pad.left} x2={pad.left + plotW} y1={yScale(t)} y2={yScale(t)} stroke={theme.border} strokeWidth={1} />
      ))}
      {yTicks.map((t) => (
        <SvgText key={`l${t}`} x={pad.left - 6} y={yScale(t) + 4} fontSize={11} fill={theme.textSecondary} textAnchor="end">
          {formatY(t)}
        </SvgText>
      ))}
      {yLabel && (
        <SvgText
          x={10}
          y={midY}
          fontSize={11}
          fontWeight="600"
          fill={theme.textSecondary}
          textAnchor="middle"
          transform={`rotate(-90, 10, ${midY})`}>
          {yLabel}
        </SvgText>
      )}
      {xLabel && (
        <SvgText
          x={pad.left + plotW / 2}
          y={height - 4}
          fontSize={11}
          fontWeight="600"
          fill={theme.textSecondary}
          textAnchor="middle">
          {xLabel}
        </SvgText>
      )}
    </>
  );
}

function FatigueZone({ x, plotW, plotH, pad }: { x: number; plotW: number; plotH: number; pad: Pad }) {
  const theme = useTheme();
  return (
    <>
      <Rect x={x} y={pad.top} width={pad.left + plotW - x} height={plotH} fill={theme.accentSoft} />
      <Line x1={x} x2={x} y1={pad.top - 4} y2={pad.top + plotH} stroke={theme.chartMarker} strokeWidth={2} strokeDasharray="4 3" />
      <SvgText x={x + 4} y={pad.top - 6} fontSize={11} fontWeight="600" fill={theme.textSecondary}>
        Fatigue
      </SvgText>
    </>
  );
}

export function LineChart({ points, formatY, formatX, xLabel, yLabel, markerX, height = 210, interactive = true }: ChartProps) {
  const theme = useTheme();
  const pad = padFor(xLabel, yLabel);
  const { width, setWidth, plotW, plotH } = useChartFrame(height, pad);

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yTicks = niceTicks(Math.min(...ys) * 0.9, Math.max(...ys) * 1.05);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];

  const xScale = (v: number) => pad.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const yScale = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const px = points.map((p) => xScale(p.x));
  const { selected, handlers } = useSelection(px, interactive);

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px[i]},${yScale(p.y)}`).join(' ');
  const sel = selected != null ? points[selected] : undefined;
  const xTicks = niceTicks(xMin, xMax, 5).filter((t) => t >= xMin && t <= xMax);
  const tickY = height - pad.bottom + 16;

  return (
    <View>
      <Readout point={sel} formatY={formatY} interactive={interactive} />
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...handlers}>
        {width > 0 && points.length > 0 && (
          <Svg width={width} height={height}>
            {markerX != null && <FatigueZone x={xScale(markerX)} plotW={plotW} plotH={plotH} pad={pad} />}
            <Axes yTicks={yTicks} yScale={yScale} plotW={plotW} plotH={plotH} height={height} pad={pad} formatY={formatY} xLabel={xLabel} yLabel={yLabel} />
            {xTicks.map((t) => (
              <SvgText key={`x${t}`} x={xScale(t)} y={tickY} fontSize={11} fill={theme.textSecondary} textAnchor="middle">
                {formatX(t)}
              </SvgText>
            ))}
            {sel && (
              <Line x1={xScale(sel.x)} x2={xScale(sel.x)} y1={pad.top} y2={pad.top + plotH} stroke={theme.textSecondary} strokeWidth={1} />
            )}
            <Path d={d} stroke={theme.chartSeries} strokeWidth={2} fill="none" strokeLinejoin="round" />
            {sel && (
              <Circle cx={xScale(sel.x)} cy={yScale(sel.y)} r={5} fill={theme.chartSeries} stroke={theme.backgroundElement} strokeWidth={2} />
            )}
          </Svg>
        )}
      </View>
    </View>
  );
}

/** Bars are drawn in the order given, left to right. */
export function BarChart({ points, formatY, formatX, xLabel, yLabel, markerX, height = 210, interactive = true }: ChartProps) {
  const theme = useTheme();
  const pad = padFor(xLabel, yLabel);
  const { width, setWidth, plotW, plotH } = useChartFrame(height, pad);

  const yTicks = niceTicks(0, Math.max(...points.map((p) => p.y), 1));
  const yMax = yTicks[yTicks.length - 1];
  const yScale = (v: number) => pad.top + plotH - (v / yMax) * plotH;
  const baseline = pad.top + plotH;

  const slot = points.length ? plotW / points.length : 0;
  const gap = 2;
  const barW = Math.max(2, Math.min(28, slot - gap));
  const barX = (i: number) => pad.left + i * slot + (slot - barW) / 2;
  const { selected, handlers } = useSelection(
    points.map((_, i) => barX(i) + barW / 2),
    interactive
  );
  const sel = selected != null ? points[selected] : undefined;
  const markerIndex = markerX != null ? points.findIndex((p) => p.x >= markerX) : -1;
  // Label every bar when there are few, otherwise every other one.
  const labelEvery = points.length > 12 ? 2 : 1;
  const tickY = height - pad.bottom + 16;

  const bar = (x: number, y: number, w: number) => {
    const r = Math.min(4, w / 2, baseline - y);
    return `M${x},${baseline} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${baseline} Z`;
  };

  return (
    <View>
      <Readout point={sel} formatY={formatY} interactive={interactive} />
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...handlers}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {markerIndex >= 0 && <FatigueZone x={pad.left + markerIndex * slot} plotW={plotW} plotH={plotH} pad={pad} />}
            <Axes yTicks={yTicks} yScale={yScale} plotW={plotW} plotH={plotH} height={height} pad={pad} formatY={formatY} xLabel={xLabel} yLabel={yLabel} />
            {points.map((p, i) => (
              <Path
                key={p.x}
                d={bar(barX(i), yScale(p.y), barW)}
                fill={theme.chartSeries}
                opacity={selected == null || selected === i ? 1 : 0.4}
              />
            ))}
            {points.map((p, i) =>
              i % labelEvery === 0 ? (
                <SvgText key={`x${p.x}`} x={barX(i) + barW / 2} y={tickY} fontSize={11} fill={theme.textSecondary} textAnchor="middle">
                  {formatX(p.x)}
                </SvgText>
              ) : null
            )}
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    minHeight: 22,
    marginBottom: 4,
  },
});
