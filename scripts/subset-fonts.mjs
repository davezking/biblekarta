// pnpm fonts:subset: writes the self-hosted WOFF2 subsets in public/fonts/ from fonts-src/.
// Subset: Basic Latin, NBSP, Ethiopic (+ Supplement, Extended, Extended-A), – — …
// Noto Sans Ethiopic stays variable (wght 400–700, wdth pinned to 100): one file is
// ~107 KB, against ~209 KB for three static weights, which would break the 250 KB budget.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import subsetFont from 'subset-font';

const RANGES = [
  [0x0020, 0x007e],
  [0x00a0, 0x00a0],
  [0x1200, 0x137f],
  [0x1380, 0x139f],
  [0x2d80, 0x2ddf],
  [0xab00, 0xab2f],
  [0x2013, 0x2014],
  [0x2026, 0x2026],
];

const FONTS = [
  { src: 'AbyssinicaSIL-Regular.ttf', out: 'AbyssinicaSIL-Regular.subset.woff2' },
  {
    src: 'NotoSansEthiopic[wdth,wght].ttf',
    out: 'NotoSansEthiopic-VF.subset.woff2',
    variationAxes: { wdth: 100, wght: { min: 400, max: 700 } },
  },
];

let text = '';
for (const [from, to] of RANGES) {
  for (let cp = from; cp <= to; cp++) text += String.fromCodePoint(cp);
}

await mkdir('public/fonts', { recursive: true });
let total = 0;
for (const font of FONTS) {
  const input = await readFile(`fonts-src/${font.src}`);
  const woff2 = await subsetFont(input, text, {
    targetFormat: 'woff2',
    ...(font.variationAxes && { variationAxes: font.variationAxes }),
  });
  await writeFile(`public/fonts/${font.out}`, woff2);
  total += woff2.length;
  console.log(`${font.out}: ${(woff2.length / 1024).toFixed(1)} KB`);
}
console.log(`total: ${(total / 1024).toFixed(1)} KB (budget 250 KB)`);
