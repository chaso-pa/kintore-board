import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { openMail } from '@/lib/contact';
import { CONTACT_EMAIL } from '@/lib/terms';

/**
 * The published point of contact, guideline 1.2's fourth requirement.
 *
 * A screen rather than a bare `mailto:` link, because the requirement is that the address be
 * published — not that a mail client exists. Tapping a link that can fail is the whole of the
 * contact route only for as long as nothing goes wrong; here the address is on screen and
 * selectable before anything is tapped, so it survives a device with no Mail app, a reviewer
 * who would rather copy it, and anyone reading over a screen recording.
 */
export default function ContactScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          ご意見・ご要望、不適切な投稿のご報告、店舗関係者の方からの掲載内容の修正・削除の
          ご依頼は、下記までご連絡ください。
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>メールアドレス</Text>
          {/* selectable so the address can be long-pressed and copied. The app has no
              clipboard dependency, and adding a native module for one string would mean a
              rebuild for something the OS already does. */}
          <Text style={styles.address} selectable>
            {CONTACT_EMAIL}
          </Text>
        </View>

        <TouchableOpacity style={styles.mailBtn} onPress={openMail}>
          <Text style={styles.mailBtnText}>メールアプリで開く</Text>
        </TouchableOpacity>

        {/* No turnaround time promised. This is run by one person, and a stated deadline
            that gets missed is worse than no deadline — it turns a slow reply into a broken
            promise. What is committed to is that everything gets read, which is the part
            that can actually be kept. */}
        <Text style={styles.note}>
          個人で運営しているため、お返事までにお時間をいただくことがあります。
          いただいた通報にはすべて目を通し、確認でき次第、順次対応します。{'\n'}
          投稿の通報は、各投稿の旗アイコンからも行えます。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.three },
  lead: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  card: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  cardLabel: { color: Colors.textMuted, fontSize: 12, marginBottom: Spacing.one },
  address: { color: Colors.textPrimary, fontSize: 17, fontWeight: '600' },
  mailBtn: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: Colors.hotPink,
  },
  mailBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  note: {
    marginTop: Spacing.four,
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 19,
  },
});
