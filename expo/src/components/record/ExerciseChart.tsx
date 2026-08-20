import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import {
  buildChartGeometry,
  formatMetric,
  metricValue,
  type ExerciseHistoryPoint,
  type MetricType,
} from '@/components/record/chart-scale';
import { Colors, Spacing } from '@/constants/theme';

const CHART_HEIGHT = 180;
const PADDING = { top: 16, right: 12, bottom: 8, left: 12 };
// Drawn radius stays small; the transparent circle on top is what fingers actually hit.
const DOT_RADIUS = 5;
const TOUCH_RADIUS = 18;

interface Props {
  points: ExerciseHistoryPoint[];
  metric: MetricType;
  selectedDate: string | null;
  onSelectPoint: (point: ExerciseHistoryPoint) => void;
}

export function ExerciseChart({ points, metric, selectedDate, onSelectPoint }: Props) {
  const [width, setWidth] = useState(0);

  const handleLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 0);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const geometry = buildChartGeometry(points, metric, { width: plotWidth, height: plotHeight });

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {width > 0 && (
        <>
          <View style={styles.axisLabels}>
            <Text style={styles.axisText}>{formatMetric(geometry.max, metric)}</Text>
            <Text style={styles.axisText}>{formatMetric(geometry.min, metric)}</Text>
          </View>

          <Svg width={width} height={CHART_HEIGHT}>
            {/* Baseline sits at the bottom of the plot area, not the view, so it lines up
                with the minimum-value label. */}
            <Line
              x1={PADDING.left}
              y1={PADDING.top + plotHeight}
              x2={PADDING.left + plotWidth}
              y2={PADDING.top + plotHeight}
              stroke={Colors.lightCyan}
              strokeWidth={1}
            />

            {geometry.plotted.length > 1 && (
              <Polyline
                points={geometry.plotted
                  .map((p) => `${p.x + PADDING.left},${p.y + PADDING.top}`)
                  .join(' ')}
                fill="none"
                stroke={Colors.hotPink}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {geometry.plotted.map((p) => {
              const isSelected = p.point.date === selectedDate;
              return (
                <Circle
                  key={p.point.date}
                  cx={p.x + PADDING.left}
                  cy={p.y + PADDING.top}
                  r={isSelected ? DOT_RADIUS + 2 : DOT_RADIUS}
                  fill={isSelected ? Colors.hotPink : Colors.surface}
                  stroke={Colors.hotPink}
                  strokeWidth={2}
                />
              );
            })}

            {/* Transparent overlay circles carry the touch target. Keeping them separate
                lets the visible dots stay small without making the chart hard to tap. */}
            {geometry.plotted.map((p) => (
              <Circle
                key={`hit-${p.point.date}`}
                cx={p.x + PADDING.left}
                cy={p.y + PADDING.top}
                r={TOUCH_RADIUS}
                fill="transparent"
                onPress={() => onSelectPoint(p.point)}
              />
            ))}
          </Svg>

          <View style={styles.dateRow}>
            <Text style={styles.axisText}>{points[0]?.date}</Text>
            {points.length > 1 && (
              <Text style={styles.axisText}>{points[points.length - 1]?.date}</Text>
            )}
          </View>

          {selectedDate && (
            <Text style={styles.selectedValue}>
              {selectedDate}:{' '}
              {formatMetric(
                metricValue(
                  points.find((p) => p.date === selectedDate) ?? points[0],
                  metric
                ),
                metric
              )}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    paddingVertical: Spacing.two,
  },
  axisLabels: {
    position: 'absolute',
    left: Spacing.two,
    top: Spacing.two,
    bottom: Spacing.four,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  axisText: { color: Colors.textMuted, fontSize: 10 },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.one,
  },
  selectedValue: {
    color: Colors.hotPink,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: Spacing.one,
  },
});
