import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsBody } from '@/components/TermsView';
import { Colors, Spacing } from '@/constants/theme';
import { TERMS_INTRO, TERMS_TITLE } from '@/lib/terms';

/**
 * The consent screen shown before this app has an account.
 *
 * It renders in place of the whole app, and the caller does not create the anonymous account
 * until onAccept resolves. That ordering is the point: App Store guideline 1.2 asks for the
 * agreement to be presented "before registering or logging in", and an account created at
 * launch and a consent screen shown afterwards would satisfy the letter of neither.
 *
 * There is no decline button. Declining would leave the app with nothing it could show — no
 * board, no gyms, no account — so the honest options are to agree or to close the app, and a
 * button that does nothing but say so is worse than its absence.
 */
export function TermsGate({ onAccept }: { onAccept: () => Promise<void> }) {
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    // Guarded rather than merely disabled: the account creation behind this runs over the
    // network, and a second tap during it would start a second registration.
    if (accepting) return;
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      // If onAccept threw, the gate stays up and the button goes live again. Leaving it
      // spinning would strand a first launch that failed on a flaky connection.
      setAccepting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{TERMS_TITLE}</Text>
        <Text style={styles.intro}>{TERMS_INTRO}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <TermsBody />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.acceptBtn, accepting && styles.acceptBtnBusy]}
          onPress={handleAccept}
          disabled={accepting}
          accessibilityRole="button">
          {accepting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptText}>同意して始める</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.footnote}>
          「同意して始める」を押すと、上記の利用規約に同意したものとみなされます。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    backgroundColor: Colors.surface,
    borderBottomWidth: 3,
    borderBottomColor: Colors.hotPink,
  },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: 'bold' },
  intro: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: Spacing.two,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.four },
  footer: {
    padding: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  acceptBtn: {
    backgroundColor: Colors.hotPink,
    padding: Spacing.three,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  acceptBtnBusy: { backgroundColor: Colors.pink },
  acceptText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footnote: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: Spacing.two,
    lineHeight: 16,
  },
});
