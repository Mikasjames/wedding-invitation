import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = import.meta.dirname;
const OUT_DIR = join(SRC_DIR, '..', 'static');
const SRC = join(SRC_DIR, 'seal-grey.svg');

const INK_LO = '#d2c8b6';
const INK_HI = '#f8f4ec';

const LEVELS = 22;

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

const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${body.trim()}\n</svg>\n`;

writeFileSync(join(OUT_DIR, 'seal.svg'), out);

console.log(`${greys.length} greys (${DARK_MIN.toFixed(0)}..${DARK_MAX.toFixed(0)}) -> ${new Set(ramp.values()).size} fills`);
console.log(
	`${(statSync(SRC).size / 1024).toFixed(0)}K source -> ${(out.length / 1024).toFixed(0)}K re-inked -> static/seal.svg`
);
console.log('now run: pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/seal.svg');