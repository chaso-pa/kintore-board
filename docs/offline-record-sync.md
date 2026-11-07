# オフライン記録同期（offline record sync）

計画: `.omc/plans/offline-record-sync-consensus.md`。進捗: `progress.txt`。

## 1. アーキテクチャ概要

- **local-first**: 記録タブ（`src/app/record/**`, `src/app/(tabs)/record/**`, `src/components/record/**`）はローカル SQLite のみを読み書きする。記録パスで `@/lib/api` / `axios` を import することは ESLint（`no-restricted-imports`）で禁止。例外は sync-engine / importer / server-api のみ。
- **ユーザー単位の DB**: `records_<userId>.db`（`records-store.ts`）。401・ログアウトでは削除しない。同ユーザーの再ログインで同期再開、別ユーザーからは見えない。削除はアカウント削除時のみ。
- **同期エンジン** (`src/lib/records/sync-engine.ts`): 単一フライト。dirty なワークアウト（`local_version > synced_version`）を、tombstone なら DELETE、それ以外は全体 POST（id による upsert）で送信。完了時は送信した版での CAS で確定し、送信中の編集は dirty のまま残る。起動トリガは NetInfo 復帰 / AppState フォアグラウンド / 書き込み 2 秒後 / リトライ（指数バックオフ）。403 は低頻度モードへ。
- **tombstone / 410**: サーバーは `deleted_workouts` を持ち、削除済み id への遅延 POST には 410 を返す。クライアントは 410 を受けたらローカルを tombstone 確定として扱う。DELETE は冪等。
- **export 取り込み（importer）**: 初回（旧ビルドからの更新・iOS 再インストール復元）はサーバーの export を全ページ取得し、ローカル行が勝つ形で挿入する。`import_state`（pending/running/done）、`covered_from`（取り込み済みの過去側の境界）、`import_count` を meta に保持。取り込み中は `covered_from` より過去の日付の新規作成を拒否（トースト）。強制終了後は再開。
- **接続判定ゲート**: 記録パスは接続状態に依存しない（`networkMode: 'always'`）。板・ジム・マシンの書き込み系のみオフライン時にボタン無効 + バナー。
- **Web は対象外**: 記録タブは「アプリ版でご利用ください」を表示。他タブは従来通り。
- **既知の制約（Android 再インストール）**: Android はアンインストールで端末ローカル DB と SecureStore が消え、再インストール後は別ユーザー扱いになるため記録は復元されない。iOS は Keychain が残るため同ユーザーとして復元される。

## 2. 運用メモ

### リリース手順
1. **Prisma マイグレーション `20261106060431_add_deleted_workouts` を、アプリ配布前に本番へ適用する**（`deleted_workouts` テーブル）。未適用だと DELETE / 410 経路が失敗する。
2. サーバーは **`TZ=UTC`** で起動し、export / 集計のトランザクションは **REPEATABLE READ** で動かす（ページ間の一貫性・日付境界のため）。
3. **Phase 2〜7 は同一リリースで出す**（途中段階だけのビルドは出さない）。
4. **バックエンドはアプリより先にデプロイする**（`GET /workouts/export`、PUT / DELETE の UUID 検証、tombstone / 410）。export が無い旧サーバー（404）に当たった場合、アプリは取り込みを「export 利用不可」として `import_state=done` で打ち切る（過去日の作成ブロックを解除するため）。この場合サーバー上の既存記録は端末に取り込まれないので、デプロイ順を守ること。404 時は meta `import_skipped_at`（ISO）を記録し、以降の起動で 1 時間以上経っていれば先頭ページから再試行する（再試行中も `import_state` は `done` のまま＝作成をブロックしない。成功したら全ページ取り込み後にフラグを消去、再び 404 ならフラグを更新）。

### ロールバック
- クライアント不具合は原則 **前進修正（hotfix）**。
- ストアで旧ビルドに戻した場合: 旧ビルドはサーバーのみ参照するため、同期済みの記録は見える。未同期分は端末 DB に残り、再び新ビルドに上げた時点で同期される（データは失われない）。E2E-6 で確認すること。
- サーバーの `deleted_workouts` は旧クライアントにも無害（追加テーブルのみ）。マイグレーションは戻さない。

## 3. バックエンド統合テスト

MySQL を用意し DSN を渡す（テスト用 DB。データは破壊されうる）:

```sh
cd backend
export KINTORE_TEST_MYSQL_DSN='user:pass@tcp(127.0.0.1:3306)/kintore_test?parseTime=true&loc=UTC'
go test -tags integration ./internal/services/...
```

DSN 未設定の場合は skip される。golden データは `backend/internal/services/testdata/`（`README.md` 参照）。クライアント側 jest（`cd expo && npm test`）は同じ golden でローカル計算とサーバー計算の一致を検証する。

## 4. 開発者向け診断（__DEV__ のみ）

プロフィールタブ（マイページ）の下部に「同期診断（dev）」が出る（`src/components/dev/SyncDiagnostics.tsx`）。本番ビルドでは描画されず、接続状態にも依存しない。

表示: 未同期件数、`import_state` / `covered_from` / `import_count`、直近の同期ログ（新しい順 30 件）。
ボタン:
- **今すぐ同期**: `kickSync` を実行。
- **ドライバースモーク実行**: 実 SQLite ドライバー上でリポジトリを検証し PASS/FAIL を一覧表示（iOS / Android 実機で全 PASS を確認）。
- **トークン破損（401 テスト）**: auth store / SecureStore のトークンを不正値にする。次のリクエストで 401 になる。
- **20000 セット生成（性能計測用）**: 1000 ワークアウト × 20 セットを UUID の id で**ローカル DB に**書き込む。同期を一時停止した上で、1 トランザクションで同期済み（`local_version = synced_version = 1`）として挿入するため、同期エンジンが送信することはない。サーバー側は更新されないため、サーバー集計との比較には使えない。開発専用アカウントで行い、不要になればアプリデータ削除またはアカウント削除で消す。

## 5. 実機 E2E チェックリスト（手動）

各項目で未同期件数・同期ログを診断で確認する。

1. **E2E-1 (AC-1)**: 機内モード ON → 新規記録（2 種目 3 セット）→ 前回セットコピー → 詳細で PR → 編集 → 種目履歴 → カレンダー → 統計 → 詳細ヘッダーから削除。スピナー・エラーが出ないこと。
2. **E2E-2 (AC-2)**: 機内モード OFF で 30 秒以内にサーバー反映（作成・更新・削除、重複なし）。機内モードのままバックグラウンド→解除→フォアグラウンドでも反映。サーバー停止中に記録→再起動後に自動反映。Network Link Conditioner「Very Bad Network」で POST 中に削除→最終的にサーバーに残らない（410 経路）。
3. **E2E-3 (AC-3)**: 既存データのあるユーザーで旧ビルド→新ビルド上書き → 取り込みカード → 完了後の数値がサーバー API と一致。取り込み途中で強制終了→再開完了。取り込み中に未カバーの過去日付をタップ→作成されずトースト。**iOS** はアプリ削除→再インストールで同ユーザー復元。**Android** の再インストールは別ユーザーになり復元されないこと（既知の制約）を確認。
4. **E2E-4 (AC-4)**: Network Link Conditioner「100% Loss」「Very Bad Network」/ Android エミュレータ遅延でも記録操作が即時。オフライン時に板・ジム・マシンの書き込みボタンが無効。キャッシュ閲覧は、オンラインでスレ詳細・ジム詳細を開いてから **5 分以内**（TanStack 既定 `gcTime` 5 分）に機内モードへ切り替えて確認。5 分超過で未表示画面のキャッシュが消えるのは仕様。
5. **E2E-5 (AC-5)**: 機内モードで記録 → 診断の「トークン破損（401 テスト）」で 401 を発生 → 再ログイン/再登録で同ユーザーに戻り未同期分が送信される。アカウント削除→再登録（新ユーザー）で前ユーザーの記録が見えない。
6. **E2E-6 (ダウングレード)**: 新ビルドで同期済み記録＋未同期記録を作成 → 旧ビルドをインストール → 同期済みは表示される → 再度新ビルドで未同期分が送信される。
7. **E2E-7 (Web)**: `cd expo && npx expo start --web` で記録タブが「アプリ版でご利用ください」、他タブは動作する。

## 6. 実機性能予算チェック

予算（plan §3.2）: 記録タブのクエリ < 50ms、autosave < 30ms（ミドルレンジ Android、20k セットのデータセット）。

手順:
1. 開発専用アカウントで dev ビルドを実機に入れ、診断の「20000 セット生成（性能計測用）」を実行（数十秒〜数分かかる）。完了表示後、記録タブを開き直す。
2. 記録タブ（カレンダー・統計・種目一覧・種目履歴）を開き、各クエリ所要時間を計測する（dev のクエリ計測ログ、または React DevTools / Flipper のプロファイラ）。< 50ms であること。
3. 新規記録で 1 セット入力し autosave の所要時間（`saveWorkout` 呼び出し〜完了）が < 30ms であること。
4. 超過時は `src/lib/records/perf.test.ts`（sql.js 上のベンチ）と実機差を比較し、インデックス / クエリを見直す。
