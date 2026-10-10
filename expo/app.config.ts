import type { ConfigContext, ExpoConfig } from 'expo/config';

// 静的な設定は app.json に置き、秘密にしたい値だけここで環境変数から差し込む。
// GOOGLE_MAPS_API_KEY は expo/.env に書く（Expo CLI が config 評価時に読み込む）。
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        ...(googleMapsApiKey ? { googleMaps: { apiKey: googleMapsApiKey } } : {}),
      },
    },
  };
};
