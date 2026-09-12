/**
 * The terms a person agrees to before this app creates them an account.
 *
 * Kept in the bundle rather than fetched. App Store guideline 1.2 wants the agreement
 * presented before registration, and registration here happens in the first seconds of the
 * first launch — putting a network request in front of that would mean a first launch on a
 * bad connection shows a blank gate with no way past it. A link to the hosted copy sits
 * under the text for anyone who wants the canonical version.
 *
 * The wording of the 禁止事項 section is not boilerplate. Guideline 1.2 asks specifically
 * that the terms make clear there is "no tolerance for objectionable content or abusive
 * users", so that sentence is stated plainly rather than left to be inferred from a list.
 */

/**
 * Bumped only when the terms change in a way people should re-read.
 *
 * Stored alongside the acceptance, so a bump re-presents the gate to everyone. Typo fixes
 * do not earn a bump — re-prompting for a comma teaches people to dismiss the screen
 * without reading it, which costs more than the comma was worth.
 */
export const TERMS_VERSION = 1;

export const POLICY_URL = 'https://app.chaso-pa.com/privacy-policies/kintore-board';

export const CONTACT_EMAIL = 'kintore-board.contact@chaso-pa.com';

export const TERMS_TITLE = '利用規約';

/**
 * The lead shown above the scrolling text, so the gate says what it is before anyone starts
 * reading.
 */
export const TERMS_INTRO =
  'このアプリは匿名の掲示板です。はじめる前に、以下の規約をご確認ください。';

export const TERMS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. このアプリについて',
    body:
      '筋トレ掲示板（以下「本アプリ」）は、筋力トレーニングに関する匿名の掲示板、'
      + 'ユーザー投稿によるジム・マシンの情報データベース、およびトレーニング記録機能を'
      + '提供します。',
  },
  {
    heading: '2. 匿名アカウントについて',
    body:
      '本アプリは、はじめて起動したときに端末ごとの匿名アカウントを自動で作成します。'
      + 'メールアドレスや氏名の登録は必要ありません。投稿には匿名IDのみが表示され、'
      + '同じスレッド内では同じIDが保たれますが、スレッドをまたぐと同一人物だとは'
      + '分かりにくくなります。',
  },
  {
    heading: '3. 禁止事項 — 不適切な投稿と迷惑行為には一切の寛容がありません',
    body:
      '運営者は、不適切なコンテンツおよび迷惑行為を行う利用者に対して、'
      + '一切の寛容を持ちません（no tolerance）。以下の行為を禁止します。\n\n'
      + '・他の利用者、ジムのスタッフ、常連客など、特定の個人への誹謗中傷、侮辱、嫌がらせ\n'
      + '・利用者や第三者の外見、行動、属性への言及、および個人を特定できる情報や写真の投稿\n'
      + '・性的な内容、暴力的な内容、差別的な内容の投稿\n'
      + '・店舗への誹謗中傷、および料金や設備についての虚偽情報の断定的な投稿\n'
      + '・スパム、宣伝、連投、その他の迷惑行為\n'
      + '・法令に違反する行為、または違法行為を助長する行為\n\n'
      + '本アプリはマシンや設備について語る場所です。設備への評価は歓迎しますが、'
      + '人への不満に向けた投稿は禁止します。',
  },
  {
    heading: '4. 違反への対応',
    body:
      '運営者は、通報された内容および自ら発見した内容を確認し、本規約に違反すると'
      + '判断した投稿を予告なく削除します。違反を繰り返す利用者、または悪質と判断した'
      + '利用者のアカウントは、予告なく利用停止とします。'
      + '通報は受領から24時間以内に確認します。',
  },
  {
    heading: '5. 通報とブロック',
    body:
      '各投稿とスレッドには通報ボタンがあり、理由を選んで運営者に報告できます。'
      + 'また、各投稿にはブロックボタンがあり、その投稿者をブロックできます。'
      + 'ブロックすると、その相手の投稿とスレッドは直ちに表示されなくなり、'
      + '同時にその投稿が運営者に報告されます。'
      + 'ブロックした相手は「マイページ」タブの「ブロックしたユーザー」から解除できます。',
  },
  {
    heading: '6. ユーザー投稿情報の扱い',
    body:
      'ジムおよびマシンの情報は、運営者が用意したものではなく、利用者が投稿したものです。'
      + '料金や設備の内容が実際と異なる場合があります。'
      + '来店の前には、必ず店舗の公式情報をご確認ください。'
      + '店舗関係者の方は、下記の連絡先より修正・削除のご依頼をいただけます。',
  },
  {
    heading: '7. 免責',
    body:
      '運営者は、本アプリの利用によって生じた損害について、責任を負いかねます。'
      + 'トレーニングの内容および実施は、利用者ご自身の判断と責任で行ってください。',
  },
  {
    heading: '8. 規約の変更',
    body:
      '本規約は変更されることがあります。重要な変更があった場合は、'
      + '本アプリの起動時にあらためて同意をお願いします。',
  },
  {
    heading: '9. お問い合わせ',
    body: `ご意見、ご要望、通報に関するお問い合わせは ${CONTACT_EMAIL} までご連絡ください。`,
  },
];
