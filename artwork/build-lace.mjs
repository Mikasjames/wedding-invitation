import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = import.meta.dirname;
const OUT_DIR = join(SRC_DIR, '..', 'static');

const TILE = 260;
const SEED = 20270612;

const SPRIG_COUNT = 20;
const BLOSSOM_COUNT = 26;

const STEM_WIDTH = 1.05;
const LEAF_WIDTH = 0.85;

const SPRIG_LEN = [50, 84];
const SPRIG_CURVE = [-20, 20];
const LEAF_SPAN = [7.5, 11];
const BLOSSOM_R = [3.6, 7.4];

const mulberry32 = (a) => () => {
	a |= 0;
	a = (a + 0x6d2b79f5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rnd = mulberry32(SEED);
const R = (lo, hi) => lo + rnd() * (hi - lo);
const n = (v) => Math.round(v * 10) / 10;

const body = [];

const push = (d, w) => body.push(`<path d="${d}" stroke-width="${n(w)}"/>`);

const leaf = (x, y, ang, len, wide) => {
	const tx = x + Math.cos(ang) * len;
	const ty = y + Math.sin(ang) * len;
	const nx = -Math.sin(ang);
	const ny = Math.cos(ang);
	const mx = x + Math.cos(ang) * len * 0.35;
	const my = y + Math.sin(ang) * len * 0.35;
	return (
		`M${n(x)} ${n(y)}` +
		`Q${n(mx + nx * wide)} ${n(my + ny * wide)} ${n(tx)} ${n(ty)}` +
		`Q${n(mx - nx * wide)} ${n(my - ny * wide)} ${n(x)} ${n(y)}Z`
	);
};

const sprig = (x, y, ang, len, curve) => {
	const ex = x + Math.cos(ang) * len;
	const ey = y + Math.sin(ang) * len;
	const mx = x + Math.cos(ang) * len * 0.5 + Math.cos(ang + Math.PI / 2) * curve;
	const my = y + Math.sin(ang) * len * 0.5 + Math.sin(ang + Math.PI / 2) * curve;

	const parts = [[`M${n(x)} ${n(y)}Q${n(mx)} ${n(my)} ${n(ex)} ${n(ey)}`, STEM_WIDTH]];
	const steps = 7 + Math.floor(rnd() * 3);
	const size = R(...LEAF_SPAN);

	for (let i = 1; i <= steps; i++) {
		const t = i / (steps + 0.4);
		const it = 1 - t;
		const px = it * it * x + 2 * it * t * mx + t * t * ex;
		const py = it * it * y + 2 * it * t * my + t * t * ey;
		const tan = Math.atan2(
			2 * it * (my - y) + 2 * t * (ey - my),
			2 * it * (mx - x) + 2 * t * (ex - mx)
		);
		const side = i % 2 ? 1 : -1;
		const l = size * (1.25 - t * 0.45) * R(0.95, 1.2);
		parts.push([leaf(px, py, tan + side * R(0.5, 0.85), l, l * R(0.36, 0.5)), LEAF_WIDTH]);
	}

	parts.push([leaf(ex, ey, Math.atan2(ey - my, ex - mx), size * 0.9, size * 0.36), LEAF_WIDTH]);

	return { rad: len + size * 1.4, parts };
};

const blossom = (x, y, r, rot) => {
	let d = '';
	for (let i = 0; i < 5; i++) {
		const a = rot + (i * 2 * Math.PI) / 5;
		const px = x + Math.cos(a) * r * 0.52;
		const py = y + Math.sin(a) * r * 0.52;
		const a1 = a - 0.62;
		const a2 = a + 0.62;
		d +=
			`M${n(px)} ${n(py)}` +
			`Q${n(x + Math.cos(a1) * r)} ${n(y + Math.sin(a1) * r)} ${n(x)} ${n(y)}` +
			`Q${n(x + Math.cos(a2) * r)} ${n(y + Math.sin(a2) * r)} ${n(px)} ${n(py)}Z`;
	}
	return { rad: r + 1, parts: [[d, 0.8]], dot: r * 0.2 };
};

const shift = (d, ox, oy) =>
	d.replace(/(-?[\d.]+)\s(-?[\d.]+)/g, (_, a, b) => `${n(+a + ox)} ${n(+b + oy)}`);

const place = (x, y, motif) => {
	for (const ox of [-TILE, 0, TILE]) {
		if (x + ox + motif.rad < 0 || x + ox - motif.rad > TILE) continue;
		for (const oy of [-TILE, 0, TILE]) {
			if (y + oy + motif.rad < 0 || y + oy - motif.rad > TILE) continue;
			for (const [d, w] of motif.parts) push(shift(d, ox, oy), w);
			if (motif.dot) {
				body.push(
					`<circle cx="${n(x + ox)}" cy="${n(y + oy)}" r="${n(motif.dot)}" fill="#000" stroke="none"/>`
				);
			}
		}
	}
};

for (let i = 0; i < SPRIG_COUNT; i++) {
	const x = R(0, TILE);
	const y = R(0, TILE);
	place(x, y, sprig(x, y, R(0, Math.PI * 2), R(...SPRIG_LEN), R(...SPRIG_CURVE)));
}

for (let i = 0; i < BLOSSOM_COUNT; i++) {
	const x = R(0, TILE);
	const y = R(0, TILE);
	place(x, y, blossom(x, y, R(...BLOSSOM_R), R(0, Math.PI * 2)));
}

const svg =
	`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}" ` +
	`fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">\n` +
	`${body.join('\n')}\n</svg>\n`;

mkdirSync(OUT_DIR, { recursive: true });

const dest = join(OUT_DIR, 'lace.svg');
writeFileSync(dest, svg);

console.log(`${SPRIG_COUNT} sprigs + ${BLOSSOM_COUNT} blossoms on a ${TILE}px tile`);
console.log(`${body.length} paths, ${(svg.length / 1024).toFixed(0)}K -> ${dest}`);
console.log('now run: pnpm dlx svgo --config artwork/svgo-trace.config.mjs -f static');