export type PresetBodyPart = 'BIG3' | '胸' | '背中' | '脚' | '肩' | '腕' | '有酸素' | 'その他';

/**
 * A body part, which since custom parts exist is any string.
 *
 * The union arm keeps the preset names as editor suggestions without rejecting a part the
 * user invented. Nothing checks this at compile time any more, so the runtime list
 * (presets plus whatever is on disk) is the only real authority — see `orderedBodyParts`.
 */
export type BodyPart = PresetBodyPart | (string & {});

/** The parts that ship with the app. Custom parts are appended after these. */
export const BODY_PARTS: PresetBodyPart[] = ['BIG3', '胸', '背中', '脚', '肩', '腕', '有酸素', 'その他'];

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
  { name: 'ラットプルダウン', bodyPart: '背中' },
  { name: 'シーテッドロウ', bodyPart: '背中' },
  { name: 'ダンベルロウ', bodyPart: '背中' },
  { name: 'チンアップ', bodyPart: '背中' },
  { name: 'フェイスプル', bodyPart: '背中' },
  { name: 'レッグプレス', bodyPart: '脚' },
  { name: 'レッグカール', bodyPart: '脚' },
  { name: 'レッグエクステンション', bodyPart: '脚' },
  { name: 'ランジ', bodyPart: '脚' },
  { name: 'カーフレイズ', bodyPart: '脚' },
  { name: 'ショルダープレス', bodyPart: '肩' },
  { name: 'サイドレイズ', bodyPart: '肩' },
  { name: 'リアレイズ', bodyPart: '肩' },
  { name: 'バイセップスカール', bodyPart: '腕' },
  { name: 'ハンマーカール', bodyPart: '腕' },
  { name: 'トライセップスプッシュダウン', bodyPart: '腕' },
  { name: 'スカルクラッシャー', bodyPart: '腕' },
  { name: 'トレッドミル', bodyPart: '有酸素' },
  { name: 'エアロバイク', bodyPart: '有酸素' },
  { name: 'クロストレーナー', bodyPart: '有酸素' },
  { name: 'ローイングマシン', bodyPart: '有酸素' },
  { name: 'ステアクライマー', bodyPart: '有酸素' },
  { name: 'ランニング', bodyPart: '有酸素' },
  { name: 'ジャンプロープ', bodyPart: '有酸素' },
];
