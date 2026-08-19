import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors } from '@/constants/theme';

/**
 * モーダル表示の画面をヘッダー右上から閉じるボタン。
 * モーダルはスタックの根なので戻るボタンが出ず、スワイプダウンしか
 * 閉じる手段がなくなるため、明示的な導線として置く。
 */
export function HeaderCloseButton() {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="閉じる">
      {/*
        iOS 26 の Liquid Glass ヘッダーはヘッダーボタンに円形の背景を自動で付ける。
        塗り円のシンボル（xmark.circle.fill）だと円が二重になるので素の xmark を使う。
        パディングを足すと右寄せのぶん端からはみ出すので、当たり判定は hitSlop で稼ぐ。
      */}
      <SymbolIcon name="xmark" ionicon="close" size={18} tintColor={Colors.textPrimary} />
    </TouchableOpacity>
  );
}
