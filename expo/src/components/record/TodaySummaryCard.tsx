import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { buildWorkoutSummary, formatVolume, type SummarySetInput } from '@/lib/workout-summary';

interface Props {
  dateLabel: string;
  sets: SummarySetInput[];
}

/**
 * Today's session as one compact block, sized to be screenshotted and sent to someone.
 *
 * That use is what drives every choice here. It carries the date and the totals so it still
 * means something once it is out of the app and in a chat window.
 *
 * One line per set, not one per exercise. Sets that look identical are not: a spot changes
 * what the set was, and collapsing them would erase which one needed help. Height is bought
 * back from the type and the spacing instead — a set line is small and tight, so a normal
 * session still fits in a single screen.
 */
export function TodaySummaryCard({ dateLabel, sets }: Props) {
  const summary = buildWorkoutSummary(sets);
  if (summary.exercises.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.totals}>
          {formatVolume(summary.totalVolumeKg)}・{summary.totalSets}セット
        </Text>
      </View>

      {summary.exercises.map((e) => (
        <View key={e.name} style={styles.block}>
          <View style={styles.rowHead}>
            <Text style={styles.name} numberOfLines={1}>
              {e.name}
            </Text>
            {e.bestE1rm !== null && <Text style={styles.rm}>1RM {e.bestE1rm.toFixed(1)}kg</Text>}
          </View>

          {e.lines.map((l) => (
            <View key={l.index} style={styles.setRow}>
              <Text style={styles.setNum}>{l.index}</Text>
              <Text style={styles.setText}>{l.text}</Text>
              {l.spotted && (
                <View style={styles.spotted}>
                  <Text style={styles.spottedText}>補助</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.three,
    // No top margin: the stats row above already ends with one, and the card carries its
    // own below so it is not left resting against whatever follows it on the screen.
    marginBottom: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#F0E8F0',
    gap: Spacing.two,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: '#F0E8F0',
    paddingBottom: Spacing.two,
  },
  date: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary },
  totals: { fontSize: 13, fontWeight: 'bold', color: Colors.hotPink },

  block: { gap: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginBottom: 1 },
  // The name yields the width and the 1RM keeps it, so a long exercise name truncates
  // instead of pushing the number off the card.
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  rm: { fontSize: 11, color: Colors.cyan, fontWeight: '600' },

  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Fixed width so the weights line up down the card rather than stepping in and out as
  // the set number goes from one digit to two.
  setNum: { width: 14, fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
  setText: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  spotted: {
    paddingHorizontal: 5,
    borderRadius: 7,
    backgroundColor: Colors.surfaceBlue,
  },
  spottedText: { fontSize: 10, lineHeight: 15, color: Colors.cyan, fontWeight: 'bold' },
});
