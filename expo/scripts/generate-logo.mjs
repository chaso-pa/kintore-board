/**
 * KintoreBoard ロゴジェネレータ（依存ゼロ / 純幾何）
 *
 * すべての図形を 1024x1024 の座標系にパラメトリックに配置して SVG を吐く。
 * 手描きパスは使わず、角丸矩形・円・三角形のみで構成しているので
 * 数値を変えれば形が連動して変わる。
 *
 *   node scripts/generate-logo.mjs            # assets/logo/*.svg を生成
 *   node scripts/generate-logo.mjs --outdir X # 出力先を変更
 *
 * PNG 化は sharp などのラスタライザに SVG を渡す（README 参照）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const S = 1024; // 設計キャンバス
const CX = S / 2;

/** src/constants/theme.ts と揃えたブランド色 */
export const PALETTE = {
  ink: '#243044',
  pink: '#FF2F9A',
  cyan: '#49CFFF',
  cream: '#FFF8FC',
};

// ---------------------------------------------------------------- primitives

const rr = (x, y, w, h, r, fill) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}"/>`;

const circle = (cx, cy, r, fill) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"/>`;

const poly = (pts, fill) =>
  `<polygon points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${fill}"/>`;

/** cx を中心に左右対称な角丸矩形のペア */
const mirroredRR = (gap, w, h, cy, r, fill) => {
  const left = CX - gap - w;
  const right = CX + gap;
  return rr(left, cy - h / 2, w, h, r, fill) + rr(right, cy - h / 2, w, h, r, fill);
};

const n = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- variants
//
// 各バリアントは { solid, knockout } を返す。
//   solid    … ベタで塗る図形（吹き出し本体など）
//   knockout … solid から抜く図形（バーベルなど）
// カラー版は solid → knockout を重ね塗り、モノクロ版は mask で抜く。
// これで 1 つの定義からカラー / 単色の両方が出せる。

/**
 * A: 吹き出しの中にバーベル。
 * 「掲示板 × 筋トレ」をそのまま図形化した本命案。
 */
function variantBubble(c) {
  const bubbleTop = 168;
  const bubbleBottom = 728;
  const bubbleX = 132;
  const barCy = (bubbleTop + bubbleBottom) / 2;

  const solid = [
    // しっぽ（先に置いて本体で根元を隠す）
    poly(
      [
        [336, 660],
        [512, 660],
        [288, 894],
      ],
      c.brand,
    ),
    rr(bubbleX, bubbleTop, S - bubbleX * 2, bubbleBottom - bubbleTop, 168, c.brand),
  ].join('');

  const knockout = [
    // シャフト
    rr(CX - 148, barCy - 25, 296, 50, 25, c.light),
    // 内プレート（大）
    mirroredRR(106, 76, 248, barCy, 28, c.light),
    // 外プレート（小）— 重量感を出すため大きめに取る
    mirroredRR(196, 62, 182, barCy, 24, c.accent),
  ].join('');

  return { solid, knockout };
}

/**
 * B: プレートを正面から見た同心円。中心の穴を吹き出し型にして掲示板を示す。
 * 最小サイズでの視認性が一番高い。
 */
function variantPlate(c) {
  const cy = 470;

  const solid = [
    poly(
      [
        [300, 700],
        [452, 700],
        [252, 918],
      ],
      c.brand,
    ),
    circle(CX, cy, 356, c.brand),
  ].join('');

  const knockout = [
    // リムの内側を抜いて輪にする
    circle(CX, cy, 268, c.accent),
    // ボルト穴 6 個
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return circle(CX + Math.cos(a) * 196, cy + Math.sin(a) * 196, 30, c.light);
    }),
    // 中心の穴 = 吹き出し
    rr(CX - 96, cy - 78, 192, 150, 46, c.light),
    poly(
      [
        [CX - 62, cy + 54],
        [CX + 6, cy + 54],
        [CX - 74, cy + 150],
      ],
      c.light,
    ),
  ].join('');

  return { solid, knockout };
}

/**
 * C: 吹き出し 2 つがそのままバーベルのプレートになっている。
 * 「匿名の会話がウェイトそのもの」という一番ひねった案。
 */
function variantTalkbell(c) {
  const cy = 440;
  const size = 300;
  const half = size / 2;
  const leftCx = 246;
  const rightCx = S - leftCx;

  const bubble = (bcx, fill) =>
    poly(
      [
        [bcx - 46, cy + half - 20],
        [bcx + 46, cy + half - 20],
        [bcx - 96, cy + half + 172],
      ],
      fill,
    ) + rr(bcx - half, cy - half, size, size, 90, fill);

  const solid = [
    // シャフト
    rr(CX - 190, cy - 34, 380, 68, 34, c.accent),
    bubble(leftCx, c.brand),
    bubble(rightCx, c.brand),
  ].join('');

  // 吹き出しの中のレス行
  const lines = (bcx) =>
    [
      rr(bcx - 90, cy - 78, 180, 38, 19, c.light),
      rr(bcx - 90, cy - 4, 120, 38, 19, c.light),
    ].join('');

  return { solid, knockout: lines(leftCx) + lines(rightCx) };
}

export const VARIANTS = {
  bubble: variantBubble,
  plate: variantPlate,
  talkbell: variantTalkbell,
};

// ---------------------------------------------------------------- compose

/**
 * @param {object}  o
 * @param {string}  o.variant   VARIANTS のキー
 * @param {number}  o.size      出力 SVG の一辺
 * @param {number}  o.scale     マーク倍率（1 = 設計サイズいっぱい）
 * @param {?string} o.bg        背景色。null で透過
 * @param {?string} o.mono      単色指定。指定時はマスク抜きの単色シルエット
 * @param {boolean} o.mark      false でマークを描かず背景のみ（アダプティブ背景用）
 */
export function buildSvg({ variant, size = S, scale = 0.74, bg = null, mono = null, mark = true }) {
  const colors = mono
    ? { brand: mono, accent: mono, light: '#000' }
    : { brand: PALETTE.pink, accent: PALETTE.cyan, light: PALETTE.cream };

  const { solid, knockout } = getVariant(variant)(colors);

  const offset = (S * (1 - scale)) / 2;
  const inner = mono
    ? `<mask id="ko" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}">` +
      `<rect width="${S}" height="${S}" fill="#fff"/>${knockout}</mask>` +
      `<g mask="url(#ko)">${solid}</g>`
    : solid + knockout;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${S} ${S}">` +
    (bg ? `<rect width="${S}" height="${S}" fill="${bg}"/>` : '') +
    (mark ? `<g transform="translate(${n(offset)} ${n(offset)}) scale(${n(scale)})">${inner}</g>` : '') +
    `</svg>`
  );
}

function getVariant(name) {
  const fn = VARIANTS[name];
  if (!fn) throw new Error(`unknown variant: ${name} (${Object.keys(VARIANTS).join(', ')})`);
  return fn;
}

// ---------------------------------------------------------------- targets

/**
 * 実際にアプリが読むアセット一式。ここを変えれば書き出しが変わる。
 * name は assets/images/<name>.png と assets/logo/<name>.svg の両方に対応する。
 */
export const targets = (variant) => [
  { name: 'icon', opts: { variant, size: 1024, scale: 0.72, bg: PALETTE.ink } },
  { name: 'favicon', opts: { variant, size: 48, scale: 0.82, bg: PALETTE.ink } },
  { name: 'splash-icon', opts: { variant, size: 512, scale: 0.9 } },
  // アダプティブアイコンは中央 66% が安全域。はみ出すと端末のマスクで欠ける。
  { name: 'android-icon-foreground', opts: { variant, size: 512, scale: 0.52 } },
  // アダプティブ背景は無地。マークは前景レイヤーだけが持つ。
  { name: 'android-icon-background', opts: { variant, size: 512, mark: false, bg: PALETTE.ink } },
  {
    name: 'android-icon-monochrome',
    opts: { variant, size: 432, scale: 0.52, mono: '#000000' },
  },
];

// ---------------------------------------------------------------- cli

/**
 * sharp は任意依存。入っていなければ SVG だけ書き出して終わる。
 * ESM は NODE_PATH を見ないので CJS の require 経由で解決する。
 */
function loadSharp(explicit) {
  const require = createRequire(import.meta.url);
  for (const id of [explicit, 'sharp'].filter(Boolean)) {
    try {
      return require(id);
    } catch {
      /* 次を試す */
    }
  }
  return null;
}

async function main(argv) {
  const arg = (k, d) => {
    const i = argv.indexOf(k);
    return i === -1 ? d : argv[i + 1];
  };

  const svgDir = resolve(HERE, '..', arg('--outdir', 'assets/logo'));
  const pngDir = resolve(HERE, '..', arg('--pngdir', 'assets/images'));
  const variant = arg('--variant', 'bubble');
  const sharp = loadSharp(arg('--sharp', null));

  mkdirSync(svgDir, { recursive: true });

  // プレビュー用に全バリアントのマークも出す
  for (const name of Object.keys(VARIANTS)) {
    writeFileSync(
      resolve(svgDir, `preview-${name}.svg`),
      buildSvg({ variant: name, size: 512, scale: 0.78, bg: PALETTE.ink }),
    );
  }

  for (const { name, opts } of targets(variant)) {
    const svg = buildSvg(opts);
    writeFileSync(resolve(svgDir, `${name}.svg`), svg);
    if (sharp) {
      let img = sharp(Buffer.from(svg));
      // 背景ありのアイコンはアルファを落とす。App Store は透過付きアイコンを弾く。
      // 透過が要るもの（スプラッシュ / アダプティブ前景 / モノクロ）はそのまま。
      if (opts.bg) img = img.flatten({ background: opts.bg });
      await img.png().toFile(resolve(pngDir, `${name}.png`));
    }
  }

  console.log(`variant="${variant}"`);
  console.log(`  svg → ${svgDir}`);
  console.log(
    sharp
      ? `  png → ${pngDir}`
      : `  png → スキップ（sharp 未検出。npm i -D sharp か --sharp <path> を指定）`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
