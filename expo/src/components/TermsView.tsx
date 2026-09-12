import * as WebBrowser from 'expo-web-browser';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { CONTACT_EMAIL, POLICY_URL, TERMS_SECTIONS } from '@/lib/terms';

/**
 * The terms, rendered.
 *
 * Its own component because the same text has to appear in two places — the gate on first
 * launch and the read-only entry under マイ — and a store reviewer who reads one and not the
 * other should not be able to find a difference between them.
 */
export function TermsBody() {
  return (
    <View style={styles.body}>
      {TERMS_SECTIONS.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          <Text style={styles.text}>{section.body}</Text>
        </View>
      ))}

      <View style={styles.links}>
        <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(POLICY_URL)}>
          <Text style={styles.link}>プライバシーポリシーを読む</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
          <Text style={styles.link}>{CONTACT_EMAIL} に問い合わせる</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.three },
  section: { marginBottom: Spacing.four },
  heading: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: Spacing.two,
    lineHeight: 22,
  },
  text: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  links: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.lightCyan,
  },
  link: { color: Colors.hotPink, fontSize: 14, fontWeight: '600' },
});
