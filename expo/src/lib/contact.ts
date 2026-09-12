import { Alert, Linking } from 'react-native';

import { CONTACT_EMAIL } from '@/lib/terms';

/**
 * Opens the mail client, and says something useful when there isn't one.
 *
 * `Linking.openURL` rejects when nothing on the device handles `mailto:`, and an unhandled
 * rejection surfaces as a raw "Unable to open URL mailto:…" — which tells the reader the app
 * is broken rather than that their device has no mail app. The Simulator is the common case
 * (it ships no Mail app at all), but it also happens on a real device once someone deletes
 * Mail, and App Store review taps this link specifically.
 *
 * The fallback shows the address rather than an apology. Guideline 1.2 asks for a published
 * point of contact, and an address a person can read and type is published; a button that
 * fails silently is not.
 */
export async function openMail(): Promise<void> {
  try {
    await Linking.openURL(`mailto:${CONTACT_EMAIL}`);
  } catch {
    Alert.alert(
      'お問い合わせ先',
      `この端末ではメールアプリを開けませんでした。\n\n${CONTACT_EMAIL}\n\n`
      + '上のアドレス宛にご連絡ください。',
      [{ text: 'OK' }]
    );
  }
}
