import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors, Spacing } from '@/constants/theme';
import { shareErrorMessage, shareViewAsImage } from '@/lib/share-image';
import {
  buildWorkoutSummary,
  formatVolume,
  isPersonalRecord,
  type SummarySetInput,
  type WorkoutSummary,
} from '@/lib/workout-summary';

interface Props {
  dateLabel: string;
  sets: SummarySetInput[];
  /**
   * Best estimated 1RM per exercise across every *other* workout, so today can be compared
   * against it. A name missing from the map means the comparison has not loaded, which is
   * not the same as there being nothing to beat.
   */
  previousBests?: Record<string, number>;
}

/** Logical width of the shared image. At device scale this lands around 1000px across. */
const SHARE_WIDTH = 360;

/**
 * Breathing room on all four sides of the shared image.
 *
 * One value rather than four, so the margin reads as even however tall the session turns
 * out. Content pressed against the edge of a picture looks cropped rather than composed,
 * and chat apps round the corners of what they show, which eats the outermost few pixels.
 */
const SHARE_MARGIN = Spacing.three;
/**
 * Never shorter than it is wide.
 *
 * Without a floor the image is exactly as tall as the card, so a two-set day produced a
 * long thin strip — unreadable as a thumbnail in a photo library or a chat, which is where
 * it gets seen first. A square floor gives short sessions a shape that previews like a
 * picture; longer ones simply grow past it.
 */
const SHARE_MIN_HEIGHT = SHARE_WIDTH;

/** The contents of the card, rendered the same way on screen and in the shared image. */
function SummaryBody({
  dateLabel,
  summary,
  previousBests,
}: {
  dateLabel: string;
  summary: WorkoutSummary;
  previousBests?: Record<string, number>;
}) {
  return (
    <>
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
            {isPersonalRecord(e.bestE1rm, previousBests?.[e.name]) && (
              <View style={styles.pr}>
                <Text style={styles.prText}>PR</Text>
              </View>
            )}
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
    </>
  );
}

/**
 * Today's session as one compact block, with a button that shares it as an image.
 *
 * One line per set, not one per exercise. Sets that look identical are not: a spot changes
 * what the set was, and collapsing them would erase which one needed help. Height is bought
 * back from the type and the spacing instead.
 *
 * The image is not a snapshot of the card on screen. It is a second copy rendered off to
 * the side at a fixed size, because what suits a card wedged into a scrolling screen and
 * what suits a picture someone opens in a chat are different shapes.
 */
export function TodaySummaryCard({ dateLabel, sets, previousBests }: Props) {
  const shareRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const summary = buildWorkoutSummary(sets);

  const onShare = async () => {
    setSharing(true);
    const result = await shareViewAsImage({
      isAvailable: () => Sharing.isAvailableAsync(),
      // A PNG rather than a JPEG: the card is flat colour and thin text, which is exactly
      // what JPEG smears. Written to a temp file because the share sheet takes a file uri.
      capture: () => captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' }),
      share: (uri) =>
        Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '今日のトレーニング' }),
    });
    setSharing(false);
    if (!result.ok) Alert.alert(shareErrorMessage(result.reason));
  };

  if (summary.exercises.length === 0) return null;

  return (
    <>
      <View style={styles.card}>
        <SummaryBody dateLabel={dateLabel} summary={summary} previousBests={previousBests} />
      </View>

      <TouchableOpacity
        style={styles.shareBtn}
        onPress={onShare}
        disabled={sharing}
        accessibilityRole="button">
        {sharing ? (
          <ActivityIndicator size="small" color={Colors.hotPink} />
        ) : (
          <SymbolIcon
            name="square.and.arrow.up"
            ionicon="share-outline"
            size={15}
            tintColor={Colors.hotPink}
          />
        )}
        <Text style={styles.shareText}>画像で共有</Text>
      </TouchableOpacity>

      {/* Parked off to the side rather than hidden: it has to be laid out for there to be
          anything to render, and opacity 0 would capture as blank. collapsable={false}
          stops Android flattening it out of the hierarchy entirely. */}
      <View style={styles.shareStage} pointerEvents="none">
        <View ref={shareRef} collapsable={false} style={styles.shareFrame}>
          <View style={styles.shareCard}>
            <SummaryBody dateLabel={dateLabel} summary={summary} previousBests={previousBests} />
          </View>
          <Text style={styles.shareCredit}>筋トレ掲示板</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.three,
    // No top margin: the stats row above already ends with one. No bottom margin and no
    // bottom radius either — the share button butts directly against this edge so the two
    // read as one panel with a footer, rather than a card and a stray button under it.
    padding: Spacing.three,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderBottomWidth: 0,
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
  // Loud on purpose. It is the one thing on the card worth showing someone, and it has to
  // survive being looked at as a thumbnail.
  pr: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: Colors.hotPink,
  },
  prText: { fontSize: 10, lineHeight: 14, color: '#fff', fontWeight: 'bold' },

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

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    paddingVertical: Spacing.two,
    // Square on top, rounded below: it finishes the shape the card starts. The card owns
    // the outline down its sides, so this only draws the part the card left off.
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 1,
    borderColor: '#F0E8F0',
    borderTopColor: '#F0E8F0',
    backgroundColor: Colors.surfacePink,
  },
  shareText: { color: Colors.hotPink, fontSize: 14, fontWeight: 'bold' },

  shareStage: { position: 'absolute', left: -10000, top: 0 },
  shareFrame: {
    width: SHARE_WIDTH,
    minHeight: SHARE_MIN_HEIGHT,
    padding: SHARE_MARGIN,
    backgroundColor: Colors.background,
    // Centred so a short session sits in the middle of the square floor rather than at the
    // top with all the slack below it.
    justifyContent: 'center',
    gap: Spacing.three,
  },
  shareCard: {
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#F0E8F0',
    gap: Spacing.two,
  },
  shareCredit: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
