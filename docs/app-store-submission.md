# App Store 提出用テキスト集

App Store Connect の入力欄に対応した下書きと、審査前に決めるべきことの一覧。

- **埋めた項目** … リポジトリの実装から事実として確認できたもの、および下書きとして書き起こしたもの
- **要記入** … 本人しか決められない、またはリポジトリ外の情報
- 文字数は App Store Connect の上限。全角も1文字として数える

---

## 1. 確定情報（`expo/app.json` より）

| 項目 | 値 |
| --- | --- |
| Bundle ID (iOS) | `com.chaso-pa.kintoreboard` |
| Package (Android) | `com.chasopa.kintoreboard` |
| Version | `1.0.0` |
| Build | `1` |
| 対応デバイス | iPhone のみ（`supportsTablet: false`） |
| 画面向き | 縦のみ |
| URL Scheme | `kintoreboard` |

> **注意**: `app.json` の `name` は `KintoreBoard` で、ホーム画面のアイコン下にこれが出ます。
> 日本語名で出したい場合は `expo.name` の変更が必要（App Store の表示名とは別物）。

---

## 2. App Store Connect 入力項目

### App 名（30文字）

案A（推奨・18文字）

```
筋トレ掲示板 - ジムとマシンのDB
```

案B（12文字）

```
筋トレ掲示板 マシン沼
```

> 名前に含めたキーワードは検索対象になるため、「ジム」「マシン」は入れる価値がある。

### サブタイトル（30文字）

```
マシン単位で語れる匿名掲示板
```

別案:

```
ジムの設備とマシンを語る匿名掲示板
```

### プロモーションテキスト（170文字）

審査を通さずいつでも差し替えられる欄。リリース直後のお知らせに使う。

```
ラットプルの軌道、ハックの深さ、ベンチ台の滑り。そういう話ができる場所です。
ジムとマシンはユーザー投稿型のデータベースになっていて、マシンごとにスレッドが立ちます。
トレーニング記録は自動保存。保存ボタンはありません。
```

（110文字）

### 概要 / Description（4000文字）

```
筋トレを拗らせた人のための、匿名掲示板とジム設備データベースです。

「このラットプルは軌道が自然」「ここのハックは深く入れる」「このスミスは角度が好みじゃない」
——周りに話せる相手がいない話を、同じ熱量の人とする場所を目指しています。

回数とセット数を並べるだけの記録アプリでも、流れていくSNSでもありません。


■ マシン単位で語れる掲示板

全体・カテゴリ別・ジム別に加えて、マシン1台ごとにスレッドが立ちます。
BIG3、胸、背中、脚、肩、腕、サプリ、食事、減量、増量、マシン沼、筋トレあるある。

投稿はすべて匿名表示。同じスレッド内では同じIDが保たれるので会話は追えますが、
スレッドをまたぐと同一人物だとは分かりにくくなります。


■ ユーザー投稿型のジムDB

Google マップの口コミでは分からない、設備そのものの情報を集めます。

・ビジター料金 / 月額料金 / ビジター利用可否
・マシンラインナップ
・フリーウェイト設備、ダンベル最大重量
・写真
・地図から近いジムを探す

情報は運営が用意したものではなく、ユーザーが投稿したものです。
新規登録された内容は公開前に確認されます。


■ マシンDB

メーカー、対象部位、設置ジムを登録できます。
1台のマシンが複数のジムに紐づくので、「あのメーカーのあれ、どこに置いてある?」が引けます。


■ トレーニング記録

掲示板を続ける理由としての、最低限の記録機能。

・保存ボタンはありません。入力した内容は自動で保存されます
・種目ごとの推定1RM(Brzycki式)と自己ベスト更新の表示
・種目別の推移
・カレンダーで実施日を一覧
・プリセット49種目に加えて、種目も部位も自分で追加できます
・補助ありのセットを区別して記録できます
・その日の記録を1枚の画像にして共有できます


■ 入れていない機能について

意図的に作っていないものがあります。

・混雑状況
・客層レビュー
・スタッフの評価
・現実での出会いやマッチング

設備の話をする場所であって、人の話をする場所にはしないためです。
```

（約1,000文字。上限4000に対して余裕あり）

> **未実装の機能を書かないこと。** 上の文面は現在の実装に合わせてあります。
> 通報・ブロックは実装済みなので、安全機能として概要に1行加えてもかまいません（§5-1参照）。

### キーワード（100文字・カンマ区切り・スペース不要）

```
筋トレ,ジム,マシン,掲示板,トレーニング記録,ワークアウト,ベンチプレス,BIG3,1RM,匿名,設備,ダンベル,フリーウェイト,減量,増量
```

（71文字）

> App 名とサブタイトルに入れた語はキーワード欄に重複させない（枠の無駄）。
> 上の案では「筋トレ」「ジム」「マシン」「掲示板」が名前と重複しているので、
> 名前を確定させたあとに重複分を削って別の語に差し替える余地がある。

### バージョン情報 / What's New（4000文字）

初回リリースのため:

```
初回リリースです。
```

### カテゴリ

| 欄 | 値 |
| --- | --- |
| プライマリ | ヘルスケア/フィットネス |
| セカンダリ | ソーシャルネットワーキング |

> 掲示板が主役なので、ソーシャルネットワーキングをプライマリにする選択もある。
> ただしソーシャル系はUGC審査が厳しく見られる傾向があるため、
> §5 が片付くまではフィットネスを主に置くのが無難。

### 著作権

```
要記入 — 例: 2026 <氏名または屋号>
```

---

## 3. URL 3種（すべて **要記入**）

| 欄 | 必須 | 状態 |
| --- | --- | --- |
| プライバシーポリシーURL | **必須** | **未作成**。無いと提出できない |
| サポートURL | **必須** | **未作成**。問い合わせ手段を含むページが必要 |
| マーケティングURL | 任意 | 未作成 |

サポートページに載せる必要があるもの（§5-1 と直結）:

- 連絡先メールアドレス
- 不適切な投稿の報告先
- 店舗関係者からの掲載修正・削除依頼の窓口

> 利用規約と問い合わせ先は**アプリ内に実装済み**です（「マイページ」タブ / `expo/src/lib/terms.ts`）。
> サポートURL用のページは別途必要ですが、アプリ内の連絡先はガイドライン1.2を満たしています。

---

## 4. App プライバシー（データ収集の申告）

実装から確認した、実際に外部へ送信されるデータ。

| データ種別 | 収集 | 用途 | ユーザーに紐づくか | トラッキング |
| --- | --- | --- | --- | --- |
| デバイスID | あり | アプリの機能（匿名アカウントの識別） | 紐づく | なし |
| 正確な位置情報 | あり | アプリの機能（近くのジム検索） | 紐づかない | なし |
| 写真 | あり | アプリの機能（ジム/マシンの写真投稿） | 紐づく | なし |
| その他のユーザーコンテンツ | あり | アプリの機能（スレッド・投稿本文） | 紐づく | なし |
| フィットネス | あり | アプリの機能（トレーニング記録） | 紐づく | なし |

**収集していないもの**（申告不要）:

- 氏名・メールアドレス・電話番号（`users` テーブルに `email` カラムは無く、認証は
  デバイスUUIDのみ / `backend/prisma/schema.prisma`）
- 連絡先、購入履歴、検索履歴、広告識別子
- サードパーティ解析SDK（未導入）

補足:

- 位置情報は「近くのジム」検索のクエリパラメータとして送信されるだけで、保存はしていません。
  ただし Apple の申告上は「収集」に該当します。
- 端末内にのみ保存され送信されないもの: カスタム種目・カスタム部位
  （`expo/src/lib/custom-exercises-storage.ts` / `custom-body-parts-storage.ts`）。

### 権限の目的文字列（`app.json` に設定済み）

| 権限 | 文言 |
| --- | --- |
| 写真 | ジムの写真を追加するために写真へのアクセスが必要です。 |
| 位置情報（使用中のみ） | 近くのジムを表示するために位置情報へのアクセスが必要です。 |

---

## 5. 審査前に対応が必要な点

### 5-1. 【最重要】ガイドライン 1.2 — ユーザー生成コンテンツ

> **2026-09-09 に、この項目で実際にリジェクトされました**
> （Submission `2c521fe2-dfe8-4ff9-a53c-3518ce9ef9d7` / v1.0 build 11）。
> 指摘は「EULAへの同意導線が無い」「ブロック機能が無い」の2点。以下はその対応後の状態です。

匿名の投稿機能を持つアプリに対して、Apple は次の4点を**すべて**求めます。

| 要件 | 状態 |
| --- | --- |
| 不適切なコンテンツをフィルタする仕組み | ✅ ジム・マシン・写真は承認制。投稿は通報キューで事後対応 |
| 不適切なコンテンツを通報する仕組みと、迅速な対応 | ✅ `ReportSheet` → `POST /api/v1/reports` → `/moderation/reports` |
| 迷惑なユーザーをブロックする機能 | ✅ 投稿の 🚫 ボタン → `POST /api/v1/posts/{postId}/block` |
| 連絡先の公開 | ✅ 「マイページ」タブ → お問い合わせ（アドレスを画面に表示 + メールアプリ起動） |

> **「マイページ」タブは今回追加したものです。** `(tabs)/profile/index.tsx` は以前から存在して
> いましたが `(tabs)/_layout.tsx` に `NativeTabs.Trigger` が無く、どこからもリンクされて
> いないため**到達不能**でした。通報キューへの唯一の管理導線もこの画面にあったので、
> admin も通報を確認できない状態だった点に注意。タブは5つになります（iOSが "More" に
> 畳み始める上限がちょうど5）。

投稿者による自分の投稿の削除も実装済み（`useDeleteContent` / `canDelete`）。

**ブロックの仕様**（Apple の要求文言に対応させたもの）:

| Apple の要求 | 実装 |
| --- | --- |
| ブロックできること | 各投稿の 🚫 ボタン。**post_id で要求し、サーバが著者を引く**ので、アプリは相手の user_id を一切知らない（匿名性を保つため） |
| 開発者に通知されること | ブロックすると同時に `reason = "block"` の通報が1件立ち、既存の `/moderation/reports` に入る。この reason は Huma の enum に入れていないので、ブロック経路からしか生成されない |
| 即座にフィードから消えること | サーバ側で `posts` / `threads` の一覧クエリから除外 + クライアントで該当キャッシュを invalidate（`blockInvalidationKeys()`） |

非表示は**双方向**です。ブロックした側もされた側も互いの投稿が見えません。
解除は「マイページ」タブ →「ブロックしたユーザー」から。

### 5-2. EULA への同意導線

✅ 実装済み。**匿名アカウントの作成より前**に同意画面を挟んでいます。

`expo/src/app/_layout.tsx` の起動順:

1. `loadFromStorage()`
2. `loadAcceptedTermsVersion()` — 同意済みバージョンを読む
3. **未同意なら `TermsGate` を表示し、`POST /api/v1/auth/anonymous` を呼ばない**
4. 「同意して始める」→ 同意を保存 → そこで初めて匿名認証

Apple の "presented to users **before** registering or logging in" は、
このアプリでは「初回起動時の匿名アカウント自動作成の前」を意味します。
同意画面を出すだけでなく、**その前に登録を走らせないこと**が要件です。

規約本文は `expo/src/lib/terms.ts` にアプリ内蔵（初回起動がオフラインでも読めるように）。
第3条に「一切の寛容を持ちません（no tolerance）」を明記しており、
`src/lib/terms.test.ts` がこの文言の存在を検証しています。

同意は端末の document ディレクトリに保存（`terms-storage.ts`）。
SecureStore ではないのは、iOS の Keychain がアンインストール後も残るためで、
再インストール時は規約を再提示します。`TERMS_VERSION` を上げると全員に再提示されます。

### 5-2-b. 審査への返信と、撮る画面収録

Apple は返信に**実機で撮った画面収録**を求めています。3シーンすべてを
**1本の動画**に収め、App Store Connect の
App Review Information → Notes に添付してください（次回以降の提出でも同じ欄に残します）。

**撮影手順**（シミュレータ不可。実機で、アプリを一度削除してから）

1. **EULA** — アプリを削除 → 再インストール → 起動。
   利用規約が全画面で出ること、スクロールできること、
   「同意して始める」を押すまで先に進めないことを映す。
   （この時点ではまだアカウントが作られていない、というのが要件の本体）
2. **通報** — スレッドを開く → 投稿の旗アイコン → 理由を選ぶ → 送信 → 完了表示。
3. **ブロック** — 同じスレッドで別の投稿の 🚫 アイコン → 確認ダイアログ →
   「ブロックする」→ **その投稿が一覧から消えるところまで映す**。
   続けて「マイページ」→「ブロックしたユーザー」に出ていることを見せると確実。

**Notes 欄に貼る文面**（英語。Apple のレビュアーが読む欄）

```
Thank you for the review. We have implemented the required precautions for
Guideline 1.2. A screen recording captured on a physical iPhone is attached.

1. EULA / Terms of Use (0:00)
   On first launch, before any account is created, the app presents the full
   Terms of Use in a scrollable, full-screen view. The user cannot proceed
   without tapping "同意して始める" (Agree and start). Section 3 of the terms
   states explicitly that there is no tolerance for objectionable content or
   abusive users, and lists the prohibited behaviour. The terms remain
   readable at any time from the "マイページ" (My Page) tab.
   Note: this app uses anonymous device-based accounts with no sign-up form.
   The anonymous account is created only after the terms are accepted.

2. Reporting objectionable content (0:xx)
   Every post and every thread has a flag button. Tapping it opens a sheet
   with a list of reasons and an optional free-text field. Reports go to a
   moderation queue built into the app, which we monitor and act on. Every
   report is reviewed; violating content is removed and repeat offenders are
   suspended.

3. Blocking abusive users (0:xx)
   Every post has a block button. Confirming it:
   - immediately hides all posts and threads by that user from the blocker's
     feed (enforced server-side, not only in the client),
   - hides the blocker's content from the blocked user as well,
   - and simultaneously files the offending post into our moderation queue,
     so we are notified of the content.
   Blocks can be reviewed and lifted from "マイページ" > "ブロックしたユーザー"
   (My > Blocked users).

Contact for content complaints: kintore-board.contact@chaso-pa.com
   The address is also published in-app under "マイページ" > "お問い合わせ"
   (My Page > Contact), shown as selectable text so it is readable even on a
   device with no mail client configured.
```

### 5-3. 年齢レーティング

匿名の掲示板を持つため、レーティング質問票の「ユーザー生成コンテンツ」に該当します。
通報・ブロックが揃っているかで結果が変わるため、**5-1 の対応後に回答すること**。

### 5-4. サインイン要件

デバイスUUIDによる匿名認証で、**アカウント作成の導線がありません**。
そのため「Sign in with Apple」の提供義務（4.8）は発生しないと考えられます。
将来メール/SNSログインを追加する場合は再検討が必要です。

### 5-5. その他の実装上の掃除

| 内容 | 場所 |
| --- | --- |
| テンプレート由来のルートが残っている（`/greeting/{name}`） | `backend/internal/routes/static_routes.go` 付近 |
| 未使用の `RECORD_AUDIO` 権限（録音機能は無い） | `expo/app.json` の `android.permissions`。Google Play 側で説明を求められる |
| アプリ表示名が `KintoreBoard`（英語） | `expo/app.json` の `expo.name` |

---

## 6. 審査メモ（App Review Information）

### 連絡先

```
要記入 — 氏名 / 電話番号 / メールアドレス
```

### デモアカウント

**不要**。起動時にデバイスUUIDで匿名アカウントが自動発行され、
ログイン画面はありません（`expo/src/app/_layout.tsx`）。
「サインイン不要」にチェックを入れる。

### 備考欄の下書き

```
本アプリはログイン不要でご利用いただけます。起動時に匿名アカウントが自動的に作成されます。

投稿はすべて匿名で表示されますが、内部的にはアカウントに紐づいており、
不適切な投稿への対応が可能です。

ジム・マシンの情報および写真はユーザー投稿型で、新規登録されたものは
管理者が承認するまで一般には表示されません。

位置情報は「近くのジムを探す」機能でのみ使用し、サーバーには保存していません。
```

> **注意**: 上の備考は現状の実装に合わせています。5-1 に着手して通報・ブロックを
> 追加したら、その旨をここに追記してください。審査担当者が探す情報です。

---

## 7. スクリーンショット

提出サイズは **6.5インチ / 1242 × 2688**。このセット1つで他のデバイスは自動生成される。
（1320 × 2868 の 6.9インチで出したところ、サイズ違いで弾かれた）

生成物は `docs/screen_shots/appstore/` に9枚。
再生成は `python3 docs/screen_shots/build_overlays.py`
（元画像は `docs/screen_shots/raw/*.jpg`、キャッチコピーはスクリプト内の `CAPTIONS` / `HERO_*`）。

ファイル名の連番が App Store Connect での並び順になる:

| # | ファイル | 内容 |
| --- | --- | --- |
| 1 | `01_hero.png` | 表紙。アイコン + 「話せる筋トレアプリ、登場。」 |
| 2 | `02_threads.png` | 板トップ — 新着スレとカテゴリ |
| 3 | `03_machines.png` | マシン一覧 — メーカーから引く |
| 4 | `04_gym_map.png` | ジム地図と一覧 |
| 5 | `05_category.png` | 種目カテゴリ（プリセット49種目） |
| 6 | `06_custom_record.png` | 種目のカスタム追加 |
| 7 | `07_memo.png` | セット入力（自動保存） |
| 8 | `08_record_menu.png` | 記録トップ — カレンダーと累計 |
| 9 | `09_record_graph.png` | 種目別の推定1RM推移 |

> **未実装の画面や、モックアップだけの機能を映さないこと。**

---

## 8. 未決定リスト

- [ ] App 名（案A / 案B / その他）
- [ ] プライマリカテゴリ（フィットネス / ソーシャル）
- [ ] 著作権表記
- [ ] プライバシーポリシーの作成と公開URL
- [ ] サポートページの作成と公開URL（連絡先を含む）
- [x] 利用規約の作成とアプリ内導線（§5-2）
- [x] 通報・ブロック・投稿削除の実装（§5-1）
- [ ] ブロック機能のDBマイグレーション適用（`npx prisma migrate deploy`）
- [ ] 審査向け画面収録の撮影と Notes への添付（§5-2-b）
- [ ] 年齢レーティングの回答
- [ ] 審査連絡先（氏名・電話・メール）
- [ ] スクリーンショットの撮影
