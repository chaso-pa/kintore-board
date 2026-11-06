/**
 * Dev-only sync diagnostics (plan §5 Observability). Rendered by the profile tab only when
 * __DEV__; never gated by connectivity so it works in airplane mode.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { runDriverSmoke, type SmokeResult } from '@/lib/records/__dev__/driver-smoke';
import { useRecordsStore } from '@/lib/records/records-store';
import { getSyncLog, kickSync, type SyncLogEntry } from '@/lib/records/sync-engine';
import { useRecords } from '@/lib/records/use-records';
import { newWorkoutId } from '@/lib/workout-writes';
import { useAuthStore } from '@/store/auth';

const SEED_WORKOUTS = 1000;
const SEED_SETS_PER_WORKOUT = 20;
const EXERCISES = ['ベンチプレス', 'スクワット', 'デッドリフト', 'ラットプルダウン', 'ショルダープレス'];

interface Snapshot {
  unsynced: number;
  importState: string;
  coveredFrom: string | null;
  importCount: number;
  log: SyncLogEntry[];
}

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.btn, disabled && styles.btnOff]} onPress={onPress} disabled={disabled}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SyncDiagnostics() {
  if (!__DEV__) return null;
  return <SyncDiagnosticsInner />;
}

function SyncDiagnosticsInner() {
  const { repo } = useRecords();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [smoke, setSmoke] = useState<SmokeResult[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repo) {
      setStatus('records DB が開いていません');
      return;
    }
    const [unsynced, cov] = await Promise.all([repo.unsyncedCount(), repo.getCoverageState()]);
    setSnap({
      unsynced,
      importState: String(cov.importState),
      coveredFrom: cov.coveredFrom ?? null,
      importCount: Number(cov.importCount ?? 0),
      log: [...getSyncLog()].reverse().slice(0, 30),
    });
  }, [repo]);

  const run = (label: string, fn: () => Promise<void>) => async () => {
    setStatus(`${label}…`);
    try {
      await fn();
      setStatus(`${label}: 完了`);
    } catch (e) {
      setStatus(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await refresh().catch(() => undefined);
  };

  const corruptToken = async () => {
    const { userId, role, setAuth } = useAuthStore.getState();
    await setAuth('invalid-token-for-401-test', userId ?? '', role);
  };

  // Writes ~20k sets into the local repo in one transaction, already marked synced, so the
  // engine never pushes them. Sync is paused meanwhile. Records-tab numbers will then differ
  // from the server's.
  const seed = async () => {
    if (!repo) throw new Error('records DB が開いていません');
    const base = Date.UTC(2024, 0, 1, 6, 0, 0);
    const items = Array.from({ length: SEED_WORKOUTS }, (_, i) => ({
      id: newWorkoutId(),
      trained_on: new Date(base + i * 86_400_000 * 0.7).toISOString(),
      memo: null,
      sets: Array.from({ length: SEED_SETS_PER_WORKOUT }, (_, j) => ({
        id: newWorkoutId(),
        sort_order: j,
        exercise_name: EXERCISES[(i + j) % EXERCISES.length],
        weight: 40 + ((i * 7 + j * 5) % 100),
        reps: 5 + (j % 8),
        sets: 1,
        memo: null,
        spotted: false,
        body_part: null,
      })),
    }));
    await useRecordsStore.getState().pauseSync();
    try {
      await repo.devInsertSynced(items);
    } finally {
      useRecordsStore.getState().resumeSync();
    }
    qc.invalidateQueries();
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => {
          setOpen((v) => !v);
          void refresh().catch(() => undefined);
        }}
      >
        <Text style={styles.title}>同期診断（dev）{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View>
          {snap && (
            <>
              <Text style={styles.line}>未同期件数: {snap.unsynced}</Text>
              <Text style={styles.line}>import_state: {snap.importState}</Text>
              <Text style={styles.line}>covered_from: {snap.coveredFrom ?? '-'}</Text>
              <Text style={styles.line}>import_count: {snap.importCount}</Text>
              <Text style={styles.sub}>直近の同期ログ</Text>
              <ScrollView style={styles.log} nestedScrollEnabled>
                {snap.log.length === 0 && <Text style={styles.logLine}>(なし)</Text>}
                {snap.log.map((e, i) => (
                  <Text key={i} style={styles.logLine}>
                    {e.at.slice(11, 19)} {e.event} {e.detail ?? ''}
                  </Text>
                ))}
              </ScrollView>
            </>
          )}
          <View style={styles.row}>
            <Btn label="更新" onPress={() => void refresh()} />
            <Btn label="今すぐ同期" onPress={run('同期', () => kickSync('dev-diagnostics'))} />
            <Btn
              label="ドライバースモーク実行"
              onPress={run('スモーク', async () => setSmoke(await runDriverSmoke()))}
            />
            <Btn label="トークン破損（401 テスト）" onPress={run('トークン破損', corruptToken)} />
            <Btn
              label={`${SEED_WORKOUTS * SEED_SETS_PER_WORKOUT} セット生成（性能計測用）`}
              onPress={run('シード', seed)}
              disabled={!repo}
            />
          </View>
          {status && <Text style={styles.line}>{status}</Text>}
          {smoke?.map((r) => (
            <Text key={r.name} style={[styles.line, { color: r.ok ? Colors.textPrimary : 'red' }]}>
              {r.ok ? 'PASS' : 'FAIL'} {r.name}
              {r.error ? ` - ${r.error}` : ''}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: Spacing.three, marginVertical: Spacing.two, padding: Spacing.two, borderWidth: 1, borderColor: '#999', borderStyle: 'dashed' },
  title: { fontWeight: '700', color: Colors.textPrimary },
  sub: { marginTop: 6, fontWeight: '600', color: Colors.textPrimary },
  line: { fontSize: 12, color: Colors.textPrimary, marginTop: 2 },
  log: { maxHeight: 140, marginTop: 4 },
  logLine: { fontSize: 11, color: Colors.textPrimary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  btn: { backgroundColor: Colors.pink, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 12 },
});
