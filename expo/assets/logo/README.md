# KintoreBoard ロゴ

すべて `scripts/generate-logo.mjs` から生成される。**画像を直接編集しない。**
形を変えたいときはスクリプトの数値を変えて再生成する。

## コンセプト

「筋トレ掲示板に、ジムDBと記録機能が付いている」というアプリの立ち位置を、
**吹き出し（＝匿名掲示板）の中にバーベル（＝筋トレ）** という一図形で表す。

- 手描きパスを使わず、角丸矩形・円・三角形だけで構成する（純幾何）
- 濃紺 `#243044` の地に蛍光ピンクを置くことで、
  「硬派な匿名掲示板」と「真面目すぎないポップさ」を同居させる
- 人物・顔・実名を想起させる要素は入れない（匿名設計と揃える）

## 配色

`src/constants/theme.ts` と同じ値を使う。

| 役割 | 変数 | 値 |
| --- | --- | --- |
| 地 / 抜き | `ink` | `#243044` |
| 吹き出し | `pink` | `#FF2F9A` |
| 外プレート | `cyan` | `#49CFFF` |
| バーベル | `cream` | `#FFF8FC` |

## バリアント

| キー | 形 | 備考 |
| --- | --- | --- |
| `bubble` | 吹き出しの中にバーベル | **採用中**。48px でも潰れない |
| `plate` | プレート正面の同心円＋中心が吹き出し | 造形は綺麗だが小サイズで中心が潰れる |
| `talkbell` | 吹き出し2つがバーベルのプレート | 発想は面白いが小サイズで2つの塊に分離する |

`preview-*.svg` で3案を見比べられる。

## 再生成

```bash
# SVG のみ（依存ゼロ）
node scripts/generate-logo.mjs

# PNG も書き出す（sharp が必要）
npm i -D sharp
node scripts/generate-logo.mjs --sharp sharp

# バリアントを差し替える
node scripts/generate-logo.mjs --variant plate --sharp sharp
```

PNG は `assets/images/` に、SVG は `assets/logo/` に出る。

## 出力物

| ファイル | サイズ | 透過 | 用途 |
| --- | --- | --- | --- |
| `icon.png` | 1024 | なし | iOS / 汎用アプリアイコン |
| `favicon.png` | 48 | なし | Web |
| `splash-icon.png` | 512 | あり | スプラッシュ（`imageWidth: 140`） |
| `android-icon-foreground.png` | 512 | あり | アダプティブ前景 |
| `android-icon-background.png` | 512 | なし | アダプティブ背景（無地） |
| `android-icon-monochrome.png` | 432 | あり | テーマドアイコン |

## 触るときの注意

- **アイコンに透過を残さない。** `bg` 指定のあるターゲットは
  `flatten()` でアルファを落としている。透過付きアイコンは App Store で弾かれる。
- **アダプティブアイコンの安全域は中央 66%。** 前景の `scale` を上げすぎると
  端末側の円マスクで欠ける。現在は `0.52`。
- **背景レイヤーにマークを描かない**（`mark: false`）。前景と二重に写る。
- 画像を差し替えたら `npx expo prebuild --clean -p ios` を実行しないと
  ネイティブ側のアイコンは更新されない。
