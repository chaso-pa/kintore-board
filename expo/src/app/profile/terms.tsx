import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsBody } from '@/components/TermsView';
import { Colors } from '@/constants/theme';

/**
 * The terms, readable again after the gate has been passed.
 *
 * Agreeing to something once and then never being able to find it again is its own problem,
 * and App Store review expects the terms to stay reachable rather than appear once on first
 * launch. Same text as the gate, from the same source.
 */
export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <TermsBody />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
