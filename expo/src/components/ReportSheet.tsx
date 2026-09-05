import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors, Spacing } from '@/constants/theme';
import { reportErrorStatus, useReport } from '@/hooks/use-report';
import {
  canSubmitReport,
  DETAIL_MAX_LENGTH,
  REPORT_REASONS,
  reportErrorMessage,
  reportTargetLabel,
  requiresDetail,
  type ReportReason,
  type ReportTargetType,
} from '@/lib/reports';

export interface ReportSheetProps {
  visible: boolean;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}

/**
 * The reporting form.
 *
 * One sheet serves every target type, because the questions are the same wherever it opens
 * from — only the noun in the header changes. A per-screen form would drift, and the one
 * that drifted would be the one nobody opened during review.
 *
 * The submitted state is deliberately not persisted anywhere. Once the sheet closes there
 * is no record the reporter can see, which is what keeps a report from turning into a
 * scoreboard they come back to check.
 */
export function ReportSheet({ visible, targetType, targetId, onClose }: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const { mutate, isPending } = useReport();

  // Reopening must not show the previous answers. Without this, reporting a second post
  // opens with the first one's reason already selected, which is easy to send by accident.
  //
  // Adjusted during render rather than in an effect. An effect would run after the sheet
  // had already painted with the stale reason and then re-render — the user would see the
  // old selection flash — and `react-hooks/set-state-in-effect` rejects it outright. This
  // is React's documented shape for resetting state when a prop changes.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason(null);
      setDetail('');
    }
  }

  const canSubmit = canSubmitReport(reason, detail);

  function handleSubmit() {
    if (!reason || !canSubmit || isPending) return;
    mutate(
      { targetType, targetId, reason, detail },
      {
        onSuccess: () => {
          onClose();
          // Deliberately vague about what happens next. Promising a decision, or a
          // timeframe, would be a claim nobody is in a position to keep.
          Alert.alert(
            '通報を受け付けました',
            '内容を確認します。対応の結果は個別にはお知らせしていません。'
          );
        },
        onError: (err) => {
          const { title, message } = reportErrorMessage(reportErrorStatus(err));
          Alert.alert(title, message);
        },
      }
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen">
      <View style={styles.backdrop}>
        {/* Tapping outside closes, matching every other sheet in the app. */}
        <Pressable style={styles.backdropFill} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{reportTargetLabel(targetType)}を通報</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <SymbolIcon
                  name="xmark"
                  ionicon="close"
                  size={18}
                  tintColor={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.lede}>
              通報は匿名で送信され、相手には通知されません。
            </Text>

            <ScrollView
              style={styles.reasonScroll}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.reasonList}>
              {REPORT_REASONS.map((option) => {
                const selected = reason === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                    onPress={() => setReason(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    activeOpacity={0.8}>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.reasonText}>
                      <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                        {option.label}
                      </Text>
                      {option.hint && <Text style={styles.reasonHint}>{option.hint}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.detailLabel}>
                詳細{requiresDetail(reason) ? '' : '（任意）'}
              </Text>
              <TextInput
                style={styles.detailInput}
                value={detail}
                onChangeText={setDetail}
                placeholder={
                  requiresDetail(reason)
                    ? '何が問題か教えてください'
                    : '補足があれば入力してください'
                }
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={DETAIL_MAX_LENGTH}
              />
            </ScrollView>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isPending}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit || isPending}>
                {isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitText}>送信</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(36, 48, 68, 0.45)' },
  backdropFill: { flex: 1 },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    maxHeight: '85%',
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: Colors.textPrimary, fontSize: 16, fontWeight: 'bold' },
  closeBtn: { padding: Spacing.one },
  lede: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing.one,
    marginBottom: Spacing.two,
  },

  reasonScroll: { flexGrow: 0 },
  reasonList: { paddingBottom: Spacing.two },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    marginBottom: Spacing.two,
    minHeight: 48,
  },
  reasonRowSelected: { borderColor: Colors.pink, backgroundColor: Colors.surfacePink },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.lightCyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.hotPink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.hotPink },
  reasonText: { flex: 1 },
  reasonLabel: { color: Colors.textPrimary, fontSize: 14 },
  reasonLabelSelected: { fontWeight: '600' },
  reasonHint: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  detailLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  detailInput: {
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    color: Colors.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
  },

  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600' },
  submitBtn: {
    flex: 1,
    backgroundColor: Colors.hotPink,
    paddingVertical: Spacing.two,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitText: { color: '#fff', fontWeight: 'bold' },
});
