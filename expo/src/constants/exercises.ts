export type PresetBodyPart =
  | 'BIG3'
  | '胸'
  | '背中'
  | '脚'
  | '肩'
  | '腕'
  | '腹部'
  | '有酸素'
  | 'その他';

/**
 * A body part, which since custom parts exist is any string.
 *
 * The union arm keeps the preset names as editor suggestions without rejecting a part the
 * user invented. Nothing checks this at compile time any more, so the runtime list
 * (presets plus whatever is on disk) is the only real authority — see `orderedBodyParts`.
 */
export type BodyPart = PresetBodyPart | (string & {});

/**
 * The parts that ship with the app. Custom parts are appended after these.
 *
 * 腹部 matches the wording the machine screens already use, so the same muscle is not
 * called two different things in one app. It sits with the other muscle groups, before the
 * two catch-alls.
 */
export const BODY_PARTS: PresetBodyPart[] = [
  'BIG3',
  '胸',
  '背中',
  '脚',
  '肩',
  '腕',
  '腹部',
  '有酸素',
  'その他',
];

/** Where an exercise goes when its body part no longer exists. */
export const FALLBACK_BODY_PART: PresetBodyPart = 'その他';

export interface ExercisePreset {
  name: string;
  bodyPart: BodyPart;
}

export const PRESET_EXERCISES: ExercisePreset[] = [
  { name: 'ベンチプレス', bodyPart: 'BIG3' },
  { name: 'スクワット', bodyPart: 'BIG3' },
  { name: 'デッドリフト', bodyPart: 'BIG3' },
  { name: 'インクラインベンチプレス', bodyPart: '胸' },
  { name: 'ダンベルフライ', bodyPart: '胸' },
  { name: 'ケーブルフライ', bodyPart: '胸' },
  { name: 'ディップス', bodyPart: '胸' },
  { name: 'チェストプレス', bodyPart: '胸' },
  { name: 'ダンベルプレス', bodyPart: '胸' },
  { name: 'ペックデック', bodyPart: '胸' },
  { name: 'ラットプルダウン', bodyPart: '背中' },
  { name: 'シーテッドロウ', bodyPart: '背中' },
  { name: 'ダンベルロウ', bodyPart: '背中' },
  { name: 'チンアップ', bodyPart: '背中' },
  { name: 'フェイスプル', bodyPart: '背中' },
  { name: 'ベントオーバーロウ', bodyPart: '背中' },
  // Chinups are already listed. A pronated grip is trained and progressed separately, so
  // it is a second entry rather than the same one.
  { name: 'プルアップ', bodyPart: '背中' },
  { name: 'Tバーロウ', bodyPart: '背中' },
  { name: 'ワンハンドローイング', bodyPart: '背中' },
  { name: 'レッグプレス', bodyPart: '脚' },
  { name: 'レッグカール', bodyPart: '脚' },
  { name: 'レッグエクステンション', bodyPart: '脚' },
  { name: 'ランジ', bodyPart: '脚' },
  { name: 'カーフレイズ', bodyPart: '脚' },
  { name: 'ルーマニアンデッドリフト', bodyPart: '脚' },
  { name: 'ブルガリアンスクワット', bodyPart: '脚' },
  { name: 'ハックスクワット', bodyPart: '脚' },
  { name: 'ヒップスラスト', bodyPart: '脚' },
  { name: 'ショルダープレス', bodyPart: '肩' },
  { name: 'サイドレイズ', bodyPart: '肩' },
  { name: 'リアレイズ', bodyPart: '肩' },
  { name: 'アップライトロウ', bodyPart: '肩' },
  { name: 'シュラッグ', bodyPart: '肩' },
  { name: 'バイセップスカール', bodyPart: '腕' },
  { name: 'ハンマーカール', bodyPart: '腕' },
  { name: 'トライセップスプッシュダウン', bodyPart: '腕' },
  { name: 'スカルクラッシャー', bodyPart: '腕' },
  { name: 'プリーチャーカール', bodyPart: '腕' },
  { name: 'ナローベンチプレス', bodyPart: '腕' },
  { name: 'リストカール', bodyPart: '腕' },

  // All three take weight and reps. Plank-style holds are left out because the record
  // screen has no field for time — logging one would mean writing a duration into a rep
  // count.
  { name: 'アブローラー', bodyPart: '腹部' },
  { name: 'ケーブルクランチ', bodyPart: '腹部' },
  { name: 'ハンギングレッグレイズ', bodyPart: '腹部' },
  { name: 'トレッドミル', bodyPart: '有酸素' },
  { name: 'エアロバイク', bodyPart: '有酸素' },
  { name: 'クロストレーナー', bodyPart: '有酸素' },
  { name: 'ローイングマシン', bodyPart: '有酸素' },
  { name: 'ステアクライマー', bodyPart: '有酸素' },
  { name: 'ランニング', bodyPart: '有酸素' },
  { name: 'ジャンプロープ', bodyPart: '有酸素' },
];
