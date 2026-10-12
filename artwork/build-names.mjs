import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = import.meta.dirname;
const OUT_DIR = join(SRC_DIR, '..', 'static');
const SRC = join(SRC_DIR, 'names.svg');

/** `--color-ink`, the colour the live hero names were set in. */
const INK = '#3e4854';

/** Lower than the plants' `0xEF`, and deliberately so. These are a flat script
 *  trace with no interior shading, so every pale fill is an antialiasing
 *  highlight rather than modelling: the ink sits at luminance 73-120 and the
 *  highlights jump to 212-232. At `0xEF` the four paths in that 212-232 band
 *  survive the test and get re-inked into solid blobs, which is the smudge
 *  failure `build-plants.mjs` documents. `0xD0` clears the whole band. */
const NEAR_WHITE_MIN = 0xd0;

/** A few units of slack so the outermost flourish is not flush against the
 *  viewBox edge, where fractional antialiasing clips a visible hairline. */
const PAD = 4;

const PATH_RE =
	/<path d="([^"]*)" fill="#([0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"/g;

const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

const isNearWhite = (p) => Math.min(...hexToRgb(p.fill)) >= NEAR_WHITE_MIN;

const src = readFileSync(SRC, 'utf8');
const SRC_W = +src.match(/width="(\d+)"/)[1];
const SRC_H = +src.match(/height="(\d+)"/)[1];

const all = [...src.matchAll(PATH_RE)].map((m) => ({
	d: m[1],
	fill: m[2].toUpperCase(),
	tx: +m[3],
	ty: +m[4]
}));

const kept = all.filter((p) => !isNearWhite(p));

/* Crop to the ink. Every path here is translated into place and drawn from
 * M0 0, so the local numbers are already in canvas units once the translate is
 * applied. Bounding the raw coordinates takes the bezier *control* points,
 * which overshoot the curve rather than understate it — the box is at most a
 * unit or two larger than the true ink, and never clips it. */
const bbox = kept.reduce(
	(box, p) => {
		const n = p.d.match(/-?\d*\.?\d+/g).map(Number);
		for (let i = 0; i < n.length; i += 2) {
			const x = p.tx + n[i];
			const y = p.ty + n[i + 1];
			if (x < box.x0) box.x0 = x;
			if (x > box.x1) box.x1 = x;
			if (y < box.y0) box.y0 = y;
			if (y > box.y1) box.y1 = y;
		}
		return box;
	},
	{ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
);

const floor = Math.floor(bbox.x0 - PAD);
const ceil = Math.ceil(bbox.x1 + PAD);
const top = Math.floor(bbox.y0 - PAD);
const bottom = Math.ceil(bbox.y1 + PAD);
const W = ceil - floor;
const H = bottom - top;

const body = kept.map((p) => `<path d="${p.d}" transform="translate(${p.tx},${p.ty})"/>`).join('\n');

const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${floor} ${top} ${W} ${H}" width="${W}" height="${H}" fill="${INK}">
${body}
</svg>
`;

mkdirSync(OUT_DIR, { recursive: true });
const dest = join(OUT_DIR, 'names.svg');
writeFileSync(dest, out);

console.log(`canvas ${SRC_W} x ${SRC_H}`);
console.log(`paths ${all.length} -> ${kept.length} (dropped ${all.length - kept.length} near-white)`);
console.log(`crop ${floor},${top} ${W}x${H}  (${((W * H) / (SRC_W * SRC_H) * 100).toFixed(0)}% of the source canvas)`);
console.log(
	`${(statSync(SRC).size / 1024).toFixed(0)}K source -> ${(out.length / 1024).toFixed(0)}K -> static/names.svg`
);
console.log('now run: pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/names.svg');