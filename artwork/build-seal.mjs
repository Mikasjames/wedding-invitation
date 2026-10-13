import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = import.meta.dirname;
const OUT_DIR = join(SRC_DIR, '..', 'static');
const SRC = join(SRC_DIR, 'seal-grey.svg');

const INK_LO = '#d2c8b6';
const INK_HI = '#f8f4ec';

const LEVELS = 22;

/** The monogram pressed into the face of the seal. Baked in rather than laid
 *  over the top as a second `<img>`: both reveals already load this one file,
 *  so it costs no extra request on the first paint and no component changes. */
const MONOGRAM = join(SRC_DIR, 'seal-name.svg');

/** Just under the wax's own `INK_LO`, so it reads as impressed rather than
 *  applied. Much darker and it stops looking like wax at all. */
const MONOGRAM_INK = '#b6a894';

/** Width in seal units, of 432. The monogram is 1234 x 1554 in its source, so
 *  the height follows from it. */
const MONOGRAM_W = 150;

/** Centred on the pressed bloom. `MONOGRAM_CY` is a little above the canvas
 *  centre, which is where the flower's optical mass sits. */
const MONOGRAM_CX = 216;
const MONOGRAM_CY = 205;

/** The names' cut-off, not the plants'. Like `names.svg` this is a flat script
 *  trace with no interior shading, so every pale fill is an antialiasing
 *  highlight — and it carries both of them: the full-canvas backdrop, plus a
 *  near-white swash inside the descender that turns into a visible blob. */
const NEAR_WHITE_MIN = 0xd0;

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const expand = (hex) => (hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex);
const luminanceOf = (hex) => luminance(...hexToRgb(expand(hex)));

const src = readFileSync(SRC, 'utf8');
const W = +src.match(/width="(\d+)"/)[1];
const H = +src.match(/height="(\d+)"/)[1];

const lo = hexToRgb(INK_LO.slice(1));
const hi = hexToRgb(INK_HI.slice(1));

const greys = [...new Set([...src.matchAll(/fill="#([0-9A-Fa-f]{3,6})"/g)].map((m) => m[1].toUpperCase()))];
const values = greys.map((hex) => luminanceOf(expand(hex)));
const DARK_MIN = Math.min(...values);
const DARK_MAX = Math.max(...values);

const rampFor = (value) => {
	const t = (value - DARK_MIN) / (DARK_MAX - DARK_MIN);
	const q = Math.round(t * (LEVELS - 1)) / (LEVELS - 1);
	return '#' + lo.map((c, i) => Math.round(c + (hi[i] - c) * q).toString(16).padStart(2, '0')).join('');
};

const ramp = new Map(greys.map((hex, i) => [hex, rampFor(values[i])]));

const reink = (match, hex) => `fill="${ramp.get(hex.toUpperCase()) ?? match}"`;

const body = src
	.replace(/<\?xml[^>]*\?>/, '')
	.replace(/<!--[\s\S]*?-->/g, '')
	.replace(/fill="#([0-9A-Fa-f]{3,6})"/g, reink);

/*
 * The monogram, in seal space.
 *
 * The coordinates are pre-multiplied rather than placed under a
 * `transform="... scale(0.1216)"`. Both render identically — svgo's
 * `floatPrecision: 0` rounds the path data to whole seal units anyway, which
 * measured 4 differing pixels out of 32000 at the seal's largest render size —
 * but pre-scaling is 9K smaller, because the scale turns the source's 4-digit
 * numbers into 2- and 3-digit ones. It also keeps the monogram clear of the
 * `cleanupNumericValues` question of whether a fractional `scale()` survives,
 * and leaves it as ordinary seal-space geometry beside the other 589 paths.
 */
const MONOGRAM_PATH_RE =
	/<path d="([^"]*)" fill="#([0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"/g;

function monogram() {
	const raw = readFileSync(MONOGRAM, 'utf8');

	const all = [...raw.matchAll(MONOGRAM_PATH_RE)].map((m) => ({
		d: m[1],
		fill: m[2].toUpperCase(),
		tx: +m[3],
		ty: +m[4]
	}));

	const kept = all.filter((p) => Math.min(...hexToRgb(p.fill)) < NEAR_WHITE_MIN);

	/* Bounded from the bezier *control* points, which overshoot the curve
	 * rather than understate it, so the box is at most a unit or two larger
	 * than the true ink and never clips it. Same reasoning as
	 * `build-names.mjs`. */
	const box = kept.reduce(
		(b, p) => {
			const n = p.d.match(/-?\d*\.?\d+/g).map(Number);
			for (let i = 0; i < n.length; i += 2) {
				const x = p.tx + n[i];
				const y = p.ty + n[i + 1];
				if (x < b.x0) b.x0 = x;
				if (x > b.x1) b.x1 = x;
				if (y < b.y0) b.y0 = y;
				if (y > b.y1) b.y1 = y;
			}
			return b;
		},
		{ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
	);

	const inkW = box.x1 - box.x0;
	const inkH = box.y1 - box.y0;

	const scale = MONOGRAM_W / inkW;
	const ox = MONOGRAM_CX - MONOGRAM_W / 2;
	const oy = MONOGRAM_CY - (inkH * scale) / 2;

	/* A blanket multiply is only safe because the path uses `M`, `C` and `Z`.
	 * An elliptical arc would not survive it: its radii, its x-axis rotation
	 * and its large-arc/sweep flags are not all lengths, and scaling the
	 * flags turns a boolean into a number. Guarded rather than assumed, since
	 * swapping in a re-traced monogram is exactly the change that breaks it. */
	const ARCS = /[aA]/;
	for (const p of kept) {
		if (ARCS.test(p.d)) {
			throw new Error('the monogram trace contains an arc; the scale needs teaching to skip it');
		}
	}

	const paths = kept
		.map((p) => {
			const d = p.d.replace(/-?\d*\.?\d+/g, (v) => String(Math.round(+v * scale * 10) / 10));
			return `<path d="${d}" transform="translate(${(ox + (p.tx - box.x0) * scale).toFixed(1)},${(oy + (p.ty - box.y0) * scale).toFixed(1)})"/>`;
		})
		.join('\n');

	return {
		markup: `<g fill="${MONOGRAM_INK}">\n${paths}\n</g>`,
		dropped: all.length - kept.length,
		inkW,
		inkH,
		scale,
		drawnW: MONOGRAM_W,
		drawnH: inkH * scale
	};
}

let mark;
try {
	mark = monogram();
} catch (err) {
	if (err.code !== 'ENOENT') throw err;
	throw new Error(
		`missing ${MONOGRAM} — the monogram is baked into the seal, so the build\n` +
			'refuses to emit one without it rather than shipping a blank wax face'
	);
}

/* Appended to `body` after it is built, not folded into the string that the
 * re-ink pass rewrites. Harmless today only by luck: neither monogram colour is
 * one of the 16 ramp values, so `reink` falls through to its `?? match` and
 * preserves them. Pick a `MONOGRAM_INK` or `MONOGRAM_HI` that *does* collide
 * with the cream ramp and it gets silently re-mapped to a wax tone. */
const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.trim()}\n${mark.markup}\n</svg>\n`;

writeFileSync(join(OUT_DIR, 'seal.svg'), out);

console.log(`${greys.length} greys (${DARK_MIN.toFixed(0)}..${DARK_MAX.toFixed(0)}) -> ${new Set(ramp.values()).size} fills`);
console.log(
	`monogram ${mark.inkW.toFixed(0)} x ${mark.inkH.toFixed(0)} -> ${mark.drawnW.toFixed(0)} x ${mark.drawnH.toFixed(0)} at ${mark.scale.toFixed(3)} (dropped ${mark.dropped} near-white)`
);
console.log(
	`${(statSync(SRC).size / 1024).toFixed(0)}K source -> ${(out.length / 1024).toFixed(0)}K re-inked -> static/seal.svg`
);
console.log('now run: pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/seal.svg');