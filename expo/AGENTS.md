# Expo Template — Agent ガイド

Expo SDK **56** / React Native **0.85** / React **19** をベースにしたネイティブアプリ雛形。
コードを書く前に必ず公式ドキュメントの該当バージョンを確認すること: https://docs.expo.dev/versions/v56.0.0/

---

## プロジェクト構造

```
expo-template/
├── app.json                  # Expo 設定 (slug, icon, plugins, experiments)
├── package.json
├── tsconfig.json             # strict: true, paths: @/* → src/*, @/assets/* → assets/*
├── assets/
│   └── images/               # アイコン, スプラッシュ, タブアイコン等
└── src/
    ├── app/                  # Expo Router のルート定義 (ここが URL になる)
    │   ├── _layout.tsx       # ルートレイアウト (ThemeProvider, Splash)
    │   ├── index.tsx         # / (ホーム画面)
    │   └── explore.tsx       # /explore
    ├── components/           # 共有 UI コンポーネント
    ├── constants/
    │   └── theme.ts          # Colors, Fonts, Spacing, BottomTabInset, MaxContentWidth
    ├── hooks/                # useTheme, useColorScheme 等
    └── global.css            # Web 用グローバルスタイル
```

### パスエイリアス

```ts
import { useTheme } from '@/hooks/use-theme';    // src/hooks/use-theme.ts
import icon from '@/assets/images/icon.png';     // assets/images/icon.png
```

---

## Expo Router (ファイルベースルーティング)

### 基本ルール

- `src/app/` 配下のファイルが自動的にルートになる
- `_layout.tsx` はそのディレクトリのレイアウト (Stack/Tabs 等)
- `(グループ名)/` はディレクトリを URL に含めないグループ化
- `[param].tsx` は動的ルート
- `[...slug].tsx` はキャッチオール動的ルート

### SDK 56 の重要な破壊的変更

`@react-navigation/*` からの直接インポートは **廃止**。必ず `expo-router` から import すること:

```ts
// NG
import { useNavigation } from '@react-navigation/native';

// OK
import { useRouter, useNavigation, Link, Redirect } from 'expo-router';
```

### ナビゲーション API

```ts
import { useRouter, useLocalSearchParams, Link } from 'expo-router';

const router = useRouter();
router.push('/profile');
router.replace('/(tabs)/home');
router.back();
router.navigate('/settings');

// 動的ルートパラメータ取得
const { id } = useLocalSearchParams<{ id: string }>();

// 型付きリンク (experiments.typedRoutes: true が前提)
<Link href="/profile">Profile</Link>
<Link href={{ pathname: '/user/[id]', params: { id: '123' } }}>User</Link>
```

### Stack レイアウト

```tsx
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
```

iOS 26+ ではデフォルトで "Liquid Glass" ヘッダーが有効。無効にするには `UIDesignRequiresCompatibility` を設定するか `expo-router/js-stack` を使う。

### Tab レイアウト (JavaScript ベース)

```tsx
import { Tabs } from 'expo-router';

export default function Layout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#208AEF' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="settings" options={{ href: null }} /> {/* バーに表示しない */}
    </Tabs>
  );
}
```

### Tab レイアウト (ネイティブ — このテンプレートで使用)

```tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function AppTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

---

## テーマ / スタイリング

`src/constants/theme.ts` に全定数が集約されている。

```ts
import { Colors, Fonts, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const theme = useTheme(); // Colors.light or Colors.dark
// theme.text / theme.background / theme.backgroundElement
// theme.backgroundSelected / theme.textSecondary
```

### Spacing スケール

| 定数 | 値 |
|------|----|
| `Spacing.half` | 2 |
| `Spacing.one` | 4 |
| `Spacing.two` | 8 |
| `Spacing.three` | 16 |
| `Spacing.four` | 24 |
| `Spacing.five` | 32 |
| `Spacing.six` | 64 |

### プラットフォーム別ファイル

```
component.tsx       # iOS / Android 共通
component.web.tsx   # Web 専用 (自動選択される)
```

---

## TypeScript

- `strict: true` 必須
- 型付きルート: `experiments.typedRoutes: true` (app.json 設定済み)
- React Compiler: `experiments.reactCompiler: true` (app.json 設定済み)

```ts
// 動的ルートの型付き params
const { id } = useLocalSearchParams<{ id: string }>();

// Href 型
import { Href } from 'expo-router';
const link: Href = { pathname: '/user/[id]', params: { id: '123' } };
```

---

## 環境変数

`.env` ファイルで管理。クライアントに公開するものは必ず `EXPO_PUBLIC_` プレフィックスをつける。

```bash
# .env
EXPO_PUBLIC_API_URL=https://api.example.com
SECRET_KEY=...  # ← app.config.js 内でのみ使用可、バンドル非公開
```

```ts
const url = process.env.EXPO_PUBLIC_API_URL; // ビルド時にインライン展開
```

**注意**: `EXPO_PUBLIC_` 変数はバンドルに平文で含まれる。シークレットを入れてはいけない。

---

## app.json の主要設定

```json
{
  "expo": {
    "name": "アプリ名",
    "slug": "url-safe-slug",
    "version": "1.0.0",
    "scheme": "myapp",
    "userInterfaceStyle": "automatic",
    "ios": { "bundleIdentifier": "com.example.myapp" },
    "android": { "package": "com.example.myapp" },
    "web": { "output": "static" },
    "plugins": ["expo-router", ["expo-splash-screen", { "backgroundColor": "#ffffff" }]],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

---

## 主要コマンド

```bash
npm start              # 開発サーバー起動 (Metro)
npm run ios            # iOS シミュレーター
npm run android        # Android エミュレーター
npm run web            # Web ブラウザ
npm run lint           # ESLint (expo lint)
npm run reset-project  # テンプレートを初期化
```

---

## EAS (Expo Application Services)

```bash
npm install -g eas-cli && eas login

eas build:configure          # 初期設定
eas build --platform ios     # クラウドビルド
eas build --platform android
eas submit --platform ios    # App Store / Google Play 提出
eas update --branch production --message "Fix crash"  # OTA 更新
```

---

## 開発ビルド vs Expo Go

| | Expo Go | Development Build |
|--|---------|------------------|
| ネイティブライブラリ追加 | 不可 | 可 |
| Push 通知テスト | 不可 | 可 |
| スプラッシュ画面確認 | 不正確 | 正確 |
| 用途 | 学習・プロトタイプ | 本番相当テスト |

ネイティブモジュールを追加したら必ず Development Build を作成してテストする。

---

## スプラッシュスクリーン

```tsx
import * as SplashScreen from 'expo-splash-screen';

// グローバルスコープで呼ぶ (await しない)
SplashScreen.preventAutoHideAsync();

// 準備完了後に非表示
await SplashScreen.hideAsync();
```

---

## よくある落とし穴

1. **`@react-navigation/*` 直接インポートは SDK 56 で廃止** → `expo-router` から import
2. **typed routes は絶対パスのみ** → 相対パスは型チェック対象外
3. **`NativeTabs` は `unstable_`** → 安定した Tabs が必要なら `expo-router` の `Tabs` を使う
4. **スプラッシュ確認は Development Build で** → Expo Go では正確に再現しない
5. **環境変数にシークレットを入れない** → `EXPO_PUBLIC_` はバンドルに平文で含まれる
6. **プラットフォーム判定**: ビルド時定数が必要な場合は `process.env.EXPO_OS`、実行時は `Platform.OS`
