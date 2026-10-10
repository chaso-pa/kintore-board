# Google Play 提出手順書（Android 版）

Android 版を Google Play で公開するまでの手順。iOS 側の提出テキストは
[`app-store-submission.md`](./app-store-submission.md) にあり、文面の多くはそのまま流用できる。

- **✅ 済** … リポジトリで確認できた状態
- **要対応** … 提出前にコード/設定の変更が必要
- **要記入** … 本人しか決められない、またはリポジトリ外の情報
- Play Console の画面名・要件は変わることがある。**Console 上の警告が常に正**

> **現在地と次にやること:** §10「今後の作業」。Play Console への入力値は [`play-console-input.md`](./play-console-input.md)。

---

## 0. 全体の流れと所要日数

| # | ステップ | 目安 |
| --- | --- | --- |
| 1 | デベロッパーアカウント作成・本人確認 | 1〜7日（審査待ち） |
| 2 | アプリ側の Android 対応（§2） | 実装次第 |
| 3 | 署名付き AAB のビルド（§3） | 半日 |
| 4 | Play Console でアプリ作成・ストア掲載情報・各種申告（§4, §5） | 1日 |
| 5 | 内部テスト → **クローズドテスト 12人 × 14日**（§6） | **最低 14日** |
| 6 | 製品版へのアクセス申請 → 審査 → 公開（§7） | 数日〜1週間 |

> **一番時間がかかるのは 5 のクローズドテスト。** 個人アカウントでは省略できないので、
> テスター集めは他の作業と並行して最初に始めること。

---

## 1. Google Play デベロッパーアカウント

1. <https://play.google.com/console/signup> にアクセスし、公開に使う Google アカウントでログイン
2. アカウントの種類を選ぶ
   - **個人**: 本名での本人確認（身分証）。§6 のクローズドテスト要件が課される
   - **組織**: D-U-N-S 番号が必要（取得に数週間）。クローズドテスト要件は無い
3. 登録料 **US$25**（1回限り）を支払う
4. 本人確認書類・住所・電話番号の確認を完了させる
5. デベロッパー名（ストアに表示される名前）を決める — **要記入**

> 個人アカウントでは、デベロッパー名とは別に**住所の公開を求められない**が、
> 収益化（有料アプリ・課金）を始めると住所が公開される。本アプリは無料なので現状は不要。

---

## 2. アプリ側の Android 対応

### 2-1. 確定情報（`expo/app.json` より）

| 項目 | 値 |
| --- | --- |
| Package（applicationId） | `com.chasopa.kintoreboard` ※iOS の Bundle ID とは異なる（Android はハイフン不可） |
| versionName | `1.1.0`（`expo.version`） |
| versionCode | `1`（`android.versionCode`）✅ |
| 画面向き | 縦のみ |
| URL Scheme | `kintoreboard` |
| API URL | `EXPO_PUBLIC_API_URL`（`.env`）= HTTPS の本番 URL ✅ |

> **Package 名は一度 Play にアップロードすると変更できない。** 変えるなら今のうち。
> `com.chasopa.kintoreboard` は Play ストア上に同名の公開アプリが無いことを確認済み（2026-09-27、未公開アプリとの重複は Console でのみ判明）。
>
> 上の値は `npx expo config --type public` で解決後の設定と一致することを確認済み。

### 2-2. 【必須】Google Maps API キー — コード側 ✅ / キー発行 要対応

`react-native-maps` は **Android では Google Maps SDK を使う**（`gym/index.tsx`, `gym/new.tsx`）。
iOS は Apple Maps なのでキー不要だったが、Android は**キーが無いと地図が表示されない／クラッシュする**。

**コード側（✅ 実装済み）**

- `expo/app.config.ts` が `app.json` を読み込み、環境変数 `GOOGLE_MAPS_API_KEY` があれば
  `android.config.googleMaps.apiKey` に差し込む → `prebuild` で AndroidManifest の
  `com.google.android.geo.API_KEY` になる（`expo config --type introspect` で確認済み）
- キーは `expo/.env`（`.gitignore` 済み）に置く。Expo CLI が config 評価時に `.env` を読み込む
- 未設定でもビルドは通るが、**地図が出ない**。`bundleRelease` 前に必ず確認（§3-5）

**キーの発行（Google Cloud Console・手作業）**

1. プロジェクトを作成（または既存を使用）し、請求先アカウントを紐づける
   （Maps SDK for Android のモバイル表示は無料枠内だが、請求先の設定自体は必須）
2. 「API とサービス → ライブラリ」で **Maps SDK for Android** を有効化
3. 「認証情報 → 認証情報を作成 → API キー」
4. 作成したキーの編集画面で制限をかける
   - **アプリケーションの制限**: Android アプリ → パッケージ名 `com.chasopa.kintoreboard` + SHA-1
   - **API の制限**: Maps SDK for Android のみ
5. `expo/.env` に追記

```bash
GOOGLE_MAPS_API_KEY=AIza...
```

6. `npx expo prebuild --platform android --clean && npx expo run:android` で地図が表示されることを確認

**SHA-1 は鍵ができるたびに追加していく**（同じキーに複数登録できる。§3-7 で取得）

| 時期 | 追加する SHA-1 |
| --- | --- |
| 今すぐ（開発用） | debug 鍵 |
| §3-2 でアップロード鍵を作ったら | アップロード鍵 |
| 初回 AAB を Play にアップロードしたら | **Play のアプリ署名鍵** |

> Android のキーは APK から抽出可能なので、`.env` に置くのは「リポジトリに載せない」ためで、
> 秘匿にはならない。**悪用を防ぐのは上の制限設定**。

> **よくある罠**: Play 配信版は Google が**アプリ署名鍵で再署名**するため、
> アップロード鍵の SHA-1 しか登録していないと、ストアから入れた版だけ地図が真っ白になる。

### 2-3. 不要な権限の削除 — ✅ 対応済み

現在の `android/app/src/main/AndroidManifest.xml`（prebuild 生成物）に以下が入っている。
Play の審査・データセーフティで説明を求められるので削る。

| 権限 | 状態 | 対応 |
| --- | --- | --- |
| `RECORD_AUDIO` | 録音機能は無い | `app.json` の `android.permissions` から削除し、`blockedPermissions` にも入れる |
| `SYSTEM_ALERT_WINDOW` | 開発用（dev menu） | `blockedPermissions` に入れる |
| `READ/WRITE_EXTERNAL_STORAGE`（maxSdk 32） | image-picker 由来。Android 12 以下のみ | そのままで可 |
| `ACCESS_FINE/COARSE_LOCATION` | 近くのジム検索で使用 | 維持。§5 で申告 |

```jsonc
"android": {
  "permissions": [
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION"
  ],
  "blockedPermissions": [
    "android.permission.RECORD_AUDIO",
    "android.permission.SYSTEM_ALERT_WINDOW"
  ],
  ...
}
```

> `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` は**入れないこと**。入れると Play の
> 「写真と動画の権限に関するポリシー」の申告が必要になる。現状は Android 13+ で
> システムの写真選択ツールが使われるので不要。

`app.json` に反映済み。`expo config --type introspect` で生成マニフェストを確認し、
2つは `tools:node="remove"` として出力される（ライブラリ側のマニフェストが追加しても、マージ時に除去される）。
最終的な権限一覧は以下の通り:

| 権限 | 由来 |
| --- | --- |
| `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` | 近くのジム検索 |
| `INTERNET` | API 通信 |
| `READ/WRITE_EXTERNAL_STORAGE`（maxSdk 32） | expo-image-picker（Android 12 以下のみ） |
| `VIBRATE` | Expo 既定 |

**追加対応（2026-10-10、本番 AAB のマージ済みマニフェストで確認）**

上はアプリ自身のマニフェストだけを見ていた。ライブラリが追加する分を含めた**マージ後**を見ると、
さらに次が入っていたので対応した。

| 追加元 | 内容 | 対応 |
| --- | --- | --- |
| expo-image-picker | `CAMERA`（危険な権限。ストアに「写真の撮影」と出る） | カメラは未使用 → plugin オプション `cameraPermission: false` / `microphonePermission: false` で除去（iOS の未使用の説明文も消える） |
| expo-location | `LocationTaskService`（`foregroundServiceType="location"`） | バックグラウンド位置情報は未使用 → `plugins/withoutLocationTaskService.js` で除去。Play のフォアグラウンドサービス申告の対象から外れる |
| androidx.work | `FOREGROUND_SERVICE` / `RECEIVE_BOOT_COMPLETED` / `WAKE_LOCK` | 通常権限で申告不要。種別付きのサービスも無い → 残す |
| androidx.biometric（expo-secure-store） | `USE_BIOMETRIC` / `USE_FINGERPRINT` | 通常権限で申告不要 → 残す |
| expo-image ほか | `ACCESS_NETWORK_STATE` | 通常権限 → 残す |

マージ後の確認方法: `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`、
追加元は `android/app/build/outputs/logs/manifest-merger-release-report.txt`。

> ビルド済み AAB で最終確認するなら、Play Console の App Bundle エクスプローラ（アップロード後）か
> `android/app/build/intermediates/merged_manifest/release/` 配下の AndroidManifest.xml を見る。

### 2-4. アカウント削除の導線 — アプリ内 ✅ / ウェブ 要対応

Google Play は「アプリ内でアカウントを作成できるアプリ」に対して、
**アプリ内**と**ウェブ上（アプリ外）**の両方でアカウント削除を申請できる導線を求める。
本アプリは起動時に匿名アカウントを自動作成するので対象として扱う。iOS（5.1.1(v)）にも効く。

**アプリ内（✅ 実装済み）**

マイページ →「アカウントを削除」→ 説明画面 → 確認ダイアログ → 削除。

| 対象 | 扱い |
| --- | --- |
| トレーニング記録・保存したジム/スレ・ブロック（する側/される側とも） | **物理削除** |
| 投稿・スレッド | 本人削除と同じ `status = deleted` で**非表示**（通報キューの証跡として行は残す） |
| 登録したジム・マシン・写真、修正提案、送った通報 | **保持**（共有の設備情報。退会済みユーザーの行に紐づいたまま） |
| `users` 行 | `status = deleted`、`device_uuid` を `deleted:<id>` に上書き（端末との紐付けを切る） |

- API: `DELETE /api/v1/users/me`（`AuthService.DeleteAccount`、1トランザクション）
- 削除済みアカウントのトークンは認証ミドルウェアが **401** を返す → アプリがトークンを破棄
- アプリ側は削除成功後にトークン・端末UUID・規約同意を消して**アプリを再起動**
  → 利用規約画面から新しい匿名アカウントで始まる
- BAN（`status = blocked`）中のアカウントは API が 403 になるためアプリからは削除できない
  → ウェブ/メールの導線で受け付ける

**ウェブ（要対応・リポジトリ外）**

専用ページは不要で、**プライバシーポリシーのページに削除の節を設けて、その URL を登録すれば足りる**。
ただし「メールアドレスが載っている」だけでは不可。Google がこの URL に求める条件は次の3つ:

1. ストア掲載と同じ**アプリ名（またはデベロッパー名）**が明記されている
2. アカウント削除を依頼する**手順**が目立つ形で書かれている
3. **削除されるデータ / 保持されるデータ**と、保持する場合の**期間**が書かれている

ポリシー内に節を作り、アンカー付き URL
`https://app.chaso-pa.com/privacy-policies/kintore-board#account-deletion` を Play Console に登録する。
ポリシー改定の指示書は [`privacy-policy-update-prompt.md`](./privacy-policy-update-prompt.md)。
節のイメージ:

```
アカウントの削除（筋トレ掲示板）

■ アプリから削除する
マイページ →「アカウントを削除」から、いつでも削除できます。

■ アプリを削除済みの場合
kintore-board.contact@chaso-pa.com 宛に、件名「アカウント削除依頼」でご連絡ください。
本アプリは匿名アカウントのため、ご本人確認のため以下をお知らせください。
・最後に利用したおおよその日付
・投稿したスレッドのタイトルなど、アカウントを特定できる情報

■ 削除されるデータ
トレーニング記録、保存したジム・スレッド、ブロック一覧は削除されます。
投稿とスレッドは非表示になります。

■ 保持されるデータ
登録されたジム・マシンの情報と写真は、ほかの利用者と共有する設備情報として保持されます。
非表示にした投稿・スレッドは、通報への対応のため保持します（保持期間: 要記入）。
これらの削除をご希望の場合も、上記アドレスへご連絡ください。
```

> メール経由の削除依頼は手作業で対応する（DB で該当ユーザーを特定し、
> `DeleteAccount` と同じ処理を行う）。件数が増えたら管理画面化を検討。
> プライバシーポリシー本文にも上の「削除されるデータ / 保持されるデータ」を反映すること。

### 2-5. バージョン番号の運用

Play は **versionCode が過去のアップロードより大きくないと受け付けない**。
ローカルビルドなので自動採番は無い。**アップロードのたびに手で上げる**。

| 値 | 設定場所 | ルール |
| --- | --- | --- |
| versionCode | `app.json` の `android.versionCode` | アップロードごとに +1（テストトラックへの AAB も含む。却下された版の番号も再利用不可） |
| versionName | `app.json` の `expo.version` | ユーザーに見える版。iOS と揃える |

> `android/app/build.gradle` の値を直接いじらないこと。`prebuild --clean` で `app.json` の値に戻る。
> 実際、現在の `android/` は古い prebuild の生成物で `versionName "1.0.0"` のままになっている。

### 2-6. その他の確認 — ✅ 対応済み（2026-10-08、Pixel 9 エミュレータ / Android 17・API 37 で確認）

| 項目 | 結果 |
| --- | --- |
| targetSdkVersion | Expo SDK 56 の既定で **36**（compile 36 / min 24）。Play の要件を満たす |
| 表示名 | ホーム画面のラベルを `筋トレ掲示板` に。`expo.name` は `KintoreBoard` のまま、`expo/plugins/withDisplayName.js` で Android の `app_name` と iOS の `CFBundleDisplayName` だけ上書き（`expo.name` を日本語にすると iOS の Xcode プロジェクト名が `app` に変わるため） |
| ステータスバー | アイコンが白く背景に溶けていた → ルートで `StatusBar style="dark"` に固定 |
| タブバー | ジムとマシンが同じアイコン（`fitness_center`）だった → ジムを `location_on` に。選択中のタブ以外ラベルが出なかった → `labelVisibilityMode="labeled"` |
| 位置情報の許可 | Android の NativeTabs は起動時に全タブをマウントするため、**スレッド画面で唐突に位置情報ダイアログが出ていた** → ジムタブを最初に開いたときに要求するよう変更 |
| キーボード | edge-to-edge（`edgeToEdgeEnabled=true`）ではウィンドウがキーボード分縮まないため、**返信欄・通報の詳細欄・記録の入力欄がキーボードの裏に隠れていた** → `src/components/KeyboardLift.tsx` を追加して各フォームに適用（Modal 内は RN のキーボードイベントで追従） |
| タブバーとの境界 | 境界線が無く、スクロールした中身がタブバーに溶け込んでいた → タブ画面の下端に線（Android のみ、`TabScreenBottomBorder`）。下端の余白が二重で中身が線の手前で途切れていた → タブ画面の SafeAreaView から下端を外す（Android のみ、`TabScreenEdges`） |
| 記録画面の戻る/キャンセル | **押しても反応しなかった**。中央寄せのタイトル（全幅の絶対配置 `<Text pointerEvents="none">`）がボタンを覆い、Android の Text は `pointerEvents` を無視するためタップを奪っていた → `pointerEvents` を View に移す（`record/new.tsx`, `record/edit/[workoutId].tsx`） |
| 戻る操作 | 戻るキー・戻るジェスチャーで画面単位に戻り、ルートでアプリを閉じる。`predictiveBackGestureEnabled: false` のままで問題なし |
| エッジ・トゥ・エッジ | 全タブ・規約画面・スレ詳細・各フォームでヘッダー/ボタンがステータスバー・ジェスチャーバーに潜らないことを確認 |

> iOS への影響: ステータスバー固定（ダークモードでも黒アイコン）と表示名（`筋トレ掲示板`）は iOS にも反映される。それ以外は iOS の挙動を変えない作り
> （`KeyboardLift` は iOS では従来の KeyboardAvoidingView / 素の View を返す）。ただし iOS 実機/シミュレータでは未確認。

--- | --- |
| targetSdkVersion | Expo SDK 56 の既定値を使う。Play の「対象 API レベル」要件を満たしているか Console の警告で確認 |
| 戻るジェスチャー | `predictiveBackGestureEnabled: false`。Android 15+ 実機で戻る操作を一通り確認 |
| エッジツーエッジ | Android 15+ は強制。タブバー・ヘッダーがステータスバー/ナビバーに潜らないか確認 |
| 表示名 | `expo.name` = `KintoreBoard`（ホーム画面のラベル）。日本語にするなら変更 |
| 規約の保存先 | document ディレクトリ。Android も再インストールで再提示される（`allowBackup` で復元された場合は除く） |

---

## 3. 署名付き AAB（Android App Bundle）のビルド

Play へは APK ではなく **AAB** をアップロードする。
**方針: EAS は使わず、手元の Mac でローカルビルドする。**

### 3-0. 前提環境

| ツール | 確認 |
| --- | --- |
| Android Studio（SDK / Build-Tools / NDK） | `npx expo run:android` が通っていれば揃っている |
| JDK 17 以上 | `java -version`。Android Studio 同梱の JBR（21）を `JAVA_HOME` に設定済みで動作確認済み |
| `ANDROID_HOME` | `~/Library/Android/sdk` |

### 3-1. 署名鍵の考え方（Play App Signing）

| 鍵 | 誰が持つ | 用途 |
| --- | --- | --- |
| アプリ署名鍵 | Google | ユーザーに配信される APK の署名。新規アプリは強制 |
| アップロード鍵 | 自分 | Play にアップロードする AAB の署名 |

- `android/app/debug.keystore` は開発用で、**これで署名したものは Play に上げられない**
- アップロード鍵を無くしても Play Console から再発行リクエストはできるが、数日かかりその間更新が出せない

### 3-2. アップロード鍵の作成（初回のみ）

```bash
mkdir -p ~/keys
keytool -genkeypair -v -storetype PKCS12 \
  -keystore ~/keys/kintoreboard-upload.keystore \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

- 名前・組織などを聞かれる。本名でなくてもよいが、後から変えられない
- **鍵ファイルとパスワードをパスワードマネージャ等にバックアップ**（リポジトリ・`expo/` 配下には置かない）

### 3-3. 署名情報を Gradle に渡す

`~/.gradle/gradle.properties`（ユーザー単位。**リポジトリには入らない**）に追記:

```properties
KINTORE_UPLOAD_STORE_FILE=/Users/<you>/keys/kintoreboard-upload.keystore
KINTORE_UPLOAD_KEY_ALIAS=upload
KINTORE_UPLOAD_STORE_PASSWORD=****
KINTORE_UPLOAD_KEY_PASSWORD=****
```

### 3-4. 署名設定を config plugin で注入する — ✅ 実装済み

`android/` は `.gitignore` 済みで、`prebuild --clean` のたびに再生成される。
`android/app/build.gradle` を手で編集しても**次の prebuild で消え、debug 鍵で署名された AAB ができてしまう**。
そこで署名設定を config plugin にして、prebuild のたびに自動で入るようにする。

実装は `expo/plugins/withReleaseSigning.js`。`android/app/build.gradle` の末尾に
`android {}` ブロックを追記し、release の署名設定だけを上書きする（テンプレート側の行は書き換えない）。
`~/.gradle/gradle.properties` の `KINTORE_UPLOAD_*` を読む。

`app.json` の `plugins` に `"./plugins/withReleaseSigning"` として登録済み。

- 鍵が無い環境では release も debug 鍵で署名される（`expo run:android --variant release` の動作確認用）
- ただし **`bundleRelease` だけは鍵が無いとエラーで止まる**ので、debug 署名の AAB を誤って作ることはない

動作確認（2026-10-10、使い捨てのテスト鍵で実施）:

| ケース | 結果 |
| --- | --- |
| `prebuild --clean` を2回 | 追記は1回だけ（重複しない） |
| 鍵なしで `bundleRelease` | `KINTORE_UPLOAD_* is not set …` で即停止 |
| 鍵ありで `bundleRelease`（`-P` で鍵情報を渡す） | 成功。AAB の署名者がテスト鍵と一致 |
| 鍵なしで `assembleRelease` | 成功。debug 鍵で署名（ローカル確認用） |

### 3-5. ビルド手順（毎回）

```bash
cd expo

# 1. 本番 API を向いているか、Maps キーが入っているか確認
#    （EXPO_PUBLIC_* はビルド時に JS に、GOOGLE_MAPS_API_KEY は prebuild 時にマニフェストに埋め込まれる）
grep -E "EXPO_PUBLIC_API_URL|GOOGLE_MAPS_API_KEY" .env
# → EXPO_PUBLIC_API_URL=https://kintore-board-backend.chaso-pa.com
# → GOOGLE_MAPS_API_KEY=AIza...（空でないこと）

# 2. app.json の android.versionCode を +1、必要なら expo.version も更新（§2-5）

# 3. android/ を app.json から作り直す（権限・Maps キー・署名 plugin・バージョンを反映）
npx expo prebuild --platform android --clean

# 4. AAB をビルド
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

> `.env` は `.env.example` だと `http://localhost:8080` なので、**開発用の値のままビルドしないこと**。
> 本番 URL 以外が埋め込まれた AAB は、審査端末で全画面エラーになる。

ビルド後の確認:

```bash
# アップロード鍵で署名されているか（Owner / 所有者 が debug 鍵の "CN=Android Debug" なら NG）
# 日本語ロケールでは "Owner" ではなく "所有者" と表示される
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab | head -5

# versionCode / versionName が想定どおりか
grep -E "versionCode|versionName" app/build.gradle
```

成果物は `~/builds/kintoreboard/<versionName>-<versionCode>.aab` などにコピーして残しておくと、
どの版を上げたか追える。

### 3-6. 実機での動作確認（release ビルド）

AAB は直接インストールできないので、確認は APK で行う。

```bash
cd expo
npx expo run:android --variant release   # 接続した実機/エミュレータに release 版を入れて起動
```

debug 版では出ない問題（Hermes の最適化、`EXPO_PUBLIC_*` の値、ProGuard 等）はここで確認する。
最終確認は §6-1 の内部テストで **Play から入れた版**を使う。

### 3-7. SHA-1 の取得（§2-2 の Maps キー用）

- アップロード鍵:
  ```bash
  keytool -list -v -keystore ~/keys/kintoreboard-upload.keystore -alias upload
  ```
- アプリ署名鍵: 初回 AAB アップロード後、Play Console →
  **テストとリリース → 設定 → アプリの完全性 → アプリ署名** に表示される
- debug 鍵（開発中に地図を出すため）:
  ```bash
  keytool -list -v -keystore expo/android/app/debug.keystore -alias androiddebugkey -storepass android
  ```

3つとも Google Cloud の API キー制限に登録する。

---

## 4. Play Console でアプリを作成・ストア掲載情報

### 4-1. アプリの作成

Play Console →「アプリを作成」

| 項目 | 値 |
| --- | --- |
| アプリ名 | iOS と揃える（`app-store-submission.md` §2 の App 名）— **要記入** |
| デフォルトの言語 | 日本語 – ja-JP |
| アプリ / ゲーム | アプリ |
| 無料 / 有料 | 無料（**後から有料に変更不可**） |
| 宣言 | デベロッパー プログラム ポリシー・米国輸出法に同意 |

### 4-2. メインのストア掲載情報

| 欄 | 上限 | 内容 |
| --- | --- | --- |
| アプリ名 | 30文字 | iOS の App 名と同じ |
| 簡単な説明 | 80文字 | 下の案 |
| 詳しい説明 | 4000文字 | iOS の「概要」をそのまま流用可 |

簡単な説明の案:

```
マシン単位で語れる筋トレ匿名掲示板。ジムの設備・マシンDBとトレーニング記録つき。
```

> Play は iOS の「キーワード」欄が無く、**タイトル・簡単な説明・詳しい説明の本文**が検索対象。
> 「筋トレ」「ジム」「マシン」「ベンチプレス」などは説明文中に自然に入れる。
> 「No.1」「最高の」などの誇大表現・他社アプリ名は掲載ポリシー違反になる。

### 4-3. グラフィック素材

| 素材 | 必須 | 仕様 |
| --- | --- | --- |
| アプリアイコン | ✅ | 512 × 512 PNG（32bit、アルファ可）、1MB 以下 |
| フィーチャー グラフィック | ✅ | 1024 × 500 PNG/JPEG（アルファ不可） |
| スマートフォンのスクリーンショット | ✅ 2〜8枚 | 16:9 か 9:16、各辺 320〜3840px。**4枚以上 1080px 以上推奨** |
| 7/10インチ タブレット | 任意 | 縦のみ・スマホ専用なら省略可 |

**作成済み（`docs/screen_shots/play/`）** — `python3 docs/screen_shots/build_overlays.py play` で再生成

| ファイル | 用途 |
| --- | --- |
| `icon_512.png` | アプリアイコン（512×512） |
| `feature_graphic.png` | フィーチャー グラフィック（1024×500、アルファなし） |
| `01_hero.png` 〜 `08_category.png` | スマートフォンのスクリーンショット 8枚（1080×1920、9:16）。ファイル名の番号順にアップロード |

- 元画像は `docs/screen_shots/raw_android/`（Pixel 9 エミュレータ / release ビルド / 本番データで撮影、1080×2424）
- エミュレータの画像は縦横比が 2:1 を超えるため Play にそのままは上げられない。合成時に 9:16 に収める
- Play は1端末 8枚まで（App Store は10枚）。iOS 版から「カスタム種目」を外し、`PLAY_ORDER` で並びを決めている
- キャプションは iOS と共通。推移グラフだけ「最大重量」タブで撮ったので、サブコピーを `CAPTIONS_PLAY` で差し替え

### 4-4. カテゴリと連絡先

| 項目 | 値 |
| --- | --- |
| アプリのカテゴリ | 健康＆フィットネス（iOS と同じ理由で、ソーシャルより無難） |
| タグ | フィットネス系を最大5つ |
| メールアドレス（必須・公開） | `kintore-board.contact@chaso-pa.com` |
| ウェブサイト | サポートページの URL — **要記入** |
| プライバシーポリシー | **必須** — iOS と同じ URL — **要記入** |

---

## 5. アプリのコンテンツ（ポリシー申告）

Play Console → **ポリシー → アプリのコンテンツ**。すべて埋めないと審査に出せない。

### 5-1. プライバシー ポリシー

iOS 用に作る公開 URL を登録。Play 側の要件として、**アプリ内からもリンクすること**
（マイページに規約と並べて置く）。

### 5-2. アプリのアクセス権

「**すべての機能が制限なく利用可能**」を選ぶ。
ログイン画面は無く、起動時の規約同意後に匿名アカウントが自動作成されるため、
テスト用アカウントは不要。補足欄に以下を記載:

```
ログインは不要です。初回起動時に利用規約への同意画面が表示され、
「同意して始める」をタップすると匿名アカウントが自動的に作成されます。
```

### 5-3. 広告

「いいえ、広告は含まれていません」

### 5-4. コンテンツのレーティング（IARC 質問票）

- カテゴリ: 「その他のすべてのアプリ」（ソーシャル/コミュニケーション寄りの質問が出る）
- **ユーザー同士がやり取り・コンテンツ共有できるか → はい**
- 位置情報を他ユーザーと共有するか → いいえ（ジムの位置は共有されるが、ユーザーの位置は共有しない）
- 暴力・性的表現・ギャンブル等 → いいえ

> UGC ありなので、日本の IARC（CERO 相当）で上がることがある。結果はそのまま受け入れる。

### 5-5. ターゲット ユーザー

- 対象年齢: **18歳以上**（または 16歳以上）を選ぶ
- 13歳未満を含めると「ファミリー ポリシー」の対象になり、匿名 UGC とはほぼ両立しない

### 5-6. データ セーフティ

`app-store-submission.md` §4 の調査結果を Play の区分に当てはめたもの。

**全体の質問**

| 質問 | 回答 |
| --- | --- |
| 必須のデータを収集・共有するか | はい |
| 送信時に暗号化されているか | はい（API は HTTPS） |
| データ削除をリクエストできるか | はい — アプリ内の削除導線あり。ウェブの削除案内 URL を記入（§2-4、**要対応**） |

**データの種類ごと**（「共有」＝第三者への提供。すべて**なし**）

| Play の区分 | 収集 | 必須/任意 | 目的 | 一時的な処理のみ |
| --- | --- | --- | --- | --- |
| 位置情報 → おおよその / 正確な位置情報 | あり | 任意 | アプリの機能 | **はい**（保存していない） |
| 写真と動画 → 写真 | あり | 任意 | アプリの機能 | いいえ |
| アプリのアクティビティ → その他のユーザー作成コンテンツ | あり | 任意 | アプリの機能 | いいえ |
| 健康とフィットネス → フィットネス情報 | あり | 任意 | アプリの機能 | いいえ |
| デバイスまたはその他の ID | あり | 必須 | アプリの機能、不正行為防止・セキュリティ | いいえ |

収集していないもの: 氏名・メール・電話番号・連絡先・広告 ID・クラッシュログ・解析（SDK 未導入）。

> 今後 Sentry / Firebase Analytics などを入れたら「クラッシュログ」「診断」「アプリの操作」を追加申告する。

### 5-7. その他の申告

| 項目 | 回答 |
| --- | --- |
| ニュースアプリ | いいえ |
| 健康アプリ | 「フィットネス」系に該当 → 健康に関する機能の申告で「アクティビティとフィットネス」を選ぶ |
| 政府機関のアプリ | いいえ |
| 金融機能 | なし |
| 位置情報（バックグラウンド） | 使用していない（フォアグラウンドのみ）→ 申告不要 |

### 5-8. ユーザー作成コンテンツ（UGC）ポリシーの確認

Play の UGC ポリシーの要件は Apple 1.2 とほぼ同じで、iOS 審査対応で**実装済み**。

| 要件 | 状態 |
| --- | --- |
| 利用規約への同意（UGC 作成前） | ✅ `TermsGate`（匿名アカウント作成前） |
| 不適切なコンテンツ・ユーザーの通報 | ✅ `ReportSheet` |
| ユーザーのブロック | ✅ 投稿の 🚫 ボタン |
| 継続的なモデレーション | ✅ `/moderation/reports` |

---

## 6. テスト トラック

### 6-1. 内部テスト（まず動作確認）

1. **テストとリリース → テスト → 内部テスト** → テスターのメールリストを作成
2. 「新しいリリースを作成」→ §3 の `.aab` をアップロード
   - 初回アップロード時に **Play App Signing** への登録を求められる → Google 生成の鍵で登録
3. リリースノート（例: `初回テスト版です。`）→ 保存 → 公開
4. 共有リンクからテスターが Play ストア経由でインストール
5. **Play から入れた版で地図が表示されるか**を必ず確認（§2-2 の SHA-1 問題）

アップロードは毎回 Play Console のブラウザ画面から手動で行う。
同じ versionCode の AAB は二度と上げられないので、失敗したら §2-5 に従って番号を上げてビルドし直す。

### 6-2. クローズドテスト（個人アカウントは必須）

2023年11月13日以降に作成した**個人**アカウントは、製品版を公開する前に:

- **12人以上**のテスターが
- **連続 14日間以上**オプトインしたまま
- クローズドテストを実施

していないと「製品版へのアクセス」を申請できない。

1. **テスト → クローズド テスト** → トラックを作成（例: `alpha`）
2. 国/地域: 日本
3. テスター: メールリスト or Google グループ（グループの方が管理が楽）
4. 内部テストで確認した AAB を昇格 or 同じものをアップロード → 審査に送信
   （クローズドテストも**Google の審査が入る**。数時間〜数日）
5. 承認後、テスターにオプトイン URL を共有 → 各自が「テスターになる」→ インストール
6. 14日間、テスターが**実際に使う**（途中で抜けるとカウントが崩れる。13〜15人確保推奨）
7. 期間中に得たフィードバックで更新版を出しておくと、次の申請の説明に書ける

> テスター募集の例: 知人、筋トレ系の Discord/X、テスター相互協力コミュニティ。
> 申請フォームで「テスターをどう集めたか」「どんなフィードバックがあったか」を聞かれるので、
> **やり取りのメモを残しておく**。

### 6-3. 製品版へのアクセスを申請

**ダッシュボード → 製品版へのアクセスを申請**。質問票（英語/日本語可）に答える:

- クローズドテストのテスター募集方法
- テスト中に受け取ったフィードバックと、それを受けて変更した内容
- アプリの対象ユーザーと提供価値
- 公開の準備ができていると判断した理由

審査は通常 7日以内。却下されたら指摘に対応してクローズドテストを継続し、再申請。

---

## 7. 製品版リリース

1. **テストとリリース → 製品版** → 国/地域: 日本（必要なら追加）
2. 「新しいリリースを作成」→ クローズドテストの AAB を昇格
3. リリースノート:

```
初回リリースです。
```

4. **段階的公開**の割合を設定（初回は 100% でも可。更新時は 10〜20% から推奨）
5. 「審査に送信」→ 通常 数時間〜7日
6. 「公開の管理」を ON にしておくと、承認後に**手動で公開ボタンを押すまで出ない**
   （iOS と公開日を揃えたい場合に便利）

---

## 8. 公開後の運用

| 作業 | 手順 |
| --- | --- |
| アップデート | `android.versionCode` を +1（必要なら `expo.version` も）→ §3-5 の手順で AAB をビルド → Play Console でアップロード |
| 審査なし更新 | 現状 `expo-updates` は無効。JS だけの修正でもストア更新が必要 |
| クラッシュ確認 | Play Console → Android Vitals（ANR・クラッシュ率が閾値を超えると露出が下がる） |
| レビュー返信 | Play Console → 評価とレビュー |
| 対象 API レベル | 毎年 8月末に引き上げ。Expo SDK を追従しないと**更新が出せなくなる** |
| ポリシー通知 | Play Console の受信トレイとメールを定期確認（期限付きの対応要求が来る） |

---

## 9. チェックリスト

### アカウント・外部準備

- [x] Google Play デベロッパー登録（$25）と本人確認（2026-10-01 完了）
- [ ] デベロッパー名 — **要記入**
- [ ] クローズドテストのテスター 12人以上（15人推奨）の確保 ← **最初に着手**
- [x] プライバシーポリシー URL（iOS と共通）— 2026-10-04 改定版
- [x] アカウント削除依頼の方法の公開 — プライバシーポリシー 7-4（`#account-deletion`）で代替

### コード・設定（master にマージ済み）

- [x] Maps キーを `.env` から読む `app.config.ts`（§2-2）
- [x] Google Maps API キーを発行し `expo/.env` に設定（§2-2）— debug 版で地図表示を確認済み
- [x] `RECORD_AUDIO` / `SYSTEM_ALERT_WINDOW` の除去（§2-3）
- [x] アカウント削除（アプリ内・API）（§2-4）
- [x] プライバシーポリシーにアカウント削除の節（手順・削除/保持データ・保持期間）を追加（§2-4）
- [ ] その URL を Play のデータセーフティに登録（§5-6）
- [x] バックエンドをデプロイ（`DELETE /api/v1/users/me` と 401 判定）
- [x] 実機でアカウント削除 → 再起動 → 新規アカウントの流れを確認
- [x] 署名用 config plugin `expo/plugins/withReleaseSigning.js` の追加と `app.json` への登録（§3-4）
- [x] 主要画面（板・ジム地図・記録・通報/ブロック）を確認 — Pixel 9 エミュレータ / release ビルド
- [x] Android 15+ でエッジツーエッジ・戻る操作の確認 — Android 17（API 37）

### ビルド・署名

- [x] アップロード鍵の作成とバックアップ（§3-2）
- [x] `~/.gradle/gradle.properties` に署名情報を設定（§3-3）
- [x] `.env` が本番 API URL になっていることを確認してから `bundleRelease`（§3-5）— versionCode 1 / 1.1.0 をビルド済み
- [x] `keytool -printcert` で AAB がアップロード鍵で署名されていることを確認（§3-5）
- [x] release 版をエミュレータで確認（§3-6）
- [x] debug 鍵・アップロード鍵の SHA-1 を Maps キー制限に登録（§3-7）— アップロード鍵署名の release 版で地図表示を確認済み
- [ ] Play のアプリ署名鍵の SHA-1 を Maps キー制限に登録（初回アップロード後、§3-7）

### Play Console

- [ ] アプリ作成（無料・日本語）
- [ ] ストア掲載情報（名前・簡単な説明・詳しい説明）
- [x] アイコン 512px / フィーチャーグラフィック 1024×500 / スクショ 8枚（9:16）— `docs/screen_shots/play/`
- [ ] アプリのコンテンツ: プライバシーポリシー、アクセス権、広告、レーティング、ターゲット、データセーフティ、健康アプリ
- [ ] 内部テストで Play 配信版の地図表示を確認
- [ ] クローズドテスト 12人 × 14日
- [ ] 製品版へのアクセス申請
- [ ] 製品版リリースの審査送信

---

## 10. 今後の作業（2026-10-10 時点）

### 10-1. Play で公開するまで（この順で）

| # | 作業 | 担当 | 参照 |
| --- | --- | --- | --- |
| 1 | **クローズドテストのテスター集め（12人以上、15人推奨）** — 14日の待ちがいちばん長いので、他と並行して今すぐ始める | 本人 | §6-2 |
| 2 | Play Console でアプリを作成し、アプリのコンテンツ・ストアの設定・ストア掲載情報を入力 | 本人 | [`play-console-input.md`](./play-console-input.md) §1〜§4 |
| 3 | 内部テストに AAB（versionCode 1）をアップロードし、Play App Signing に登録 | 本人 | 入力シート §5 |
| 4 | **アプリ署名鍵の SHA-1 を Maps API キーに追加**し、Play から入れた版で地図が表示されることを確認 | 本人 | 入力シート §6 / §3-7 |
| 5 | クローズドテストを開始（同じ AAB を昇格、または versionCode を上げて再ビルド）。12人 × 連続14日。フィードバックと対応をメモに残す | 本人 | §6-2 |
| 6 | 製品版へのアクセスを申請（テスターの集め方・受けたフィードバック・対応内容を回答） | 本人 | §6-3 |
| 7 | 製品版リリース。「公開の管理」を ON にすると承認後に手動で公開できる | 本人 | §7 |

### 10-2. バックエンドの再発防止（Issue で管理）

10/10 の障害（DB 未接続のまま起動し、全 API が 500）を受けた対応。

- [ ] DB に接続できなければ起動を止める（`main.go` の `continuing without DB` を `log.Fatal` に）
- [ ] `/health` で DB に ping する
- [ ] `UpdateWorkout` をトランザクションにする（失敗時にセットが消える）

### 10-3. 余裕があれば

| 作業 | 理由 |
| --- | --- |
| ジムタブを初めて開いたとき、地図が現在地へ移動しない（Android） | 位置情報は取れていて、一覧は距離順になる。現在地ボタンを押せば移動する |
| ストアのスクショを撮り直す | 本番のスレが2件、写真付きのマシンが0台で、見た目が寂しい。中身が増えてから `raw_android/` を差し替えて `build_overlays.py play` |
| プライバシーポリシー 2-6 の表現 | ログは収集基盤に送っていないが、Kubernetes がノード上で一時的に保持している（容量で自動削除）。より正確に書くなら改定 |
| 本番のテストデータの掃除 | スクショ用のエミュレータのアカウント（10/1〜10/10 の記録）、それ以前のエミュレータのアカウント、`device_uuid` が `claude-diag-` で始まる空のアカウント3つ |

### 10-4. 次の iOS リリースに入る変更

Android 対応で master に入った変更のうち、iOS にも効くもの。

- ホーム画面の表示名が `KintoreBoard` → `筋トレ掲示板`
- ステータスバーのアイコンが常に黒（ダークモードでも）
- `Info.plist` から未使用のカメラ・マイクの説明文が消える
- キーボードまわりは iOS の挙動を変えない作り（シミュレータで動作確認済み）

### 10-5. 公開後に毎回やること

- アップロードのたびに `app.json` の `android.versionCode` を +1（§2-5）
- ビルド前に `expo/.env` の `EXPO_PUBLIC_API_URL` が本番 URL か確認（§3-5）
- 毎年8月末の対象 API レベル引き上げに合わせて Expo SDK を更新（§8）

