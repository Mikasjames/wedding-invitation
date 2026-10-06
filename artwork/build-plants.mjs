import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = import.meta.dirname;
const OUT_DIR = join(SRC_DIR, '..', 'static', 'plants');

const INK = '#9ba3ac';

const NEAR_WHITE_MIN = 0xef;
const OPACITY_FLOOR = 0.12;
const OPACITY_CEIL = 1.0;
const OPACITY_GAMMA = 1.6;

const NAMES = ['plant_1', 'plant_2', 'plant_3'];

const PATH_RE =
	/<path d="([^"]*)" fill="#([0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"/g;

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const darknessOf = (hex) => 1 - luminance(...hexToRgb(hex)) / 255;

function parse(name) {
	const src = readFileSync(join(SRC_DIR, `${name}.svg`), 'utf8');
	const W = +src.match(/width="(\d+)"/)[1];
	const H = +src.match(/height="(\d+)"/)[1];
	const paths = [...src.matchAll(PATH_RE)].map((m) => ({
		d: m[1],
		fill: m[2].toUpperCase(),
		tx: m[3],
		ty: m[4]
	}));
	return { name, W, H, paths };
}

const files = NAMES.map(parse);

const isNearWhite = (p) => Math.min(...hexToRgb(p.fill)) >= NEAR_WHITE_MIN;
const kept = files.flatMap((f) => f.paths).filter((p) => !isNearWhite(p));
const darks = kept.map((p) => darknessOf(p.fill));
const DARK_MIN = Math.min(...darks);
const DARK_MAX = Math.max(...darks);

const opacityFor = (fill) => {
	const norm = (darknessOf(fill) - DARK_MIN) / (DARK_MAX - DARK_MIN);
	return +(OPACITY_FLOOR + (OPACITY_CEIL - OPACITY_FLOOR) * norm ** OPACITY_GAMMA).toFixed(2);
};

mkdirSync(OUT_DIR, { recursive: true });

const report = [];
for (const f of files) {
	const survivors = f.paths.filter((p) => !isNearWhite(p));
	const body = survivors
		.map((p) => {
			const o = opacityFor(p.fill);
			const op = o === 1 ? '' : ` fill-opacity="${o}"`;
			return `<path d="${p.d}"${op} transform="translate(${p.tx},${p.ty})"/>`;
		})
		.join('\n');

	const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f.W} ${f.H}" width="${f.W}" height="${f.H}" fill="${INK}">
${body}
</svg>
`;

	const dest = join(OUT_DIR, `${f.name}.svg`);
	writeFileSync(dest, out);
	report.push({
		file: f.name,
		paths: `${f.paths.length} -> ${survivors.length}`,
		dropped: f.paths.length - survivors.length,
		before: (statSync(join(SRC_DIR, `${f.name}.svg`)).size / 1024).toFixed(0) + 'K',
		after: (statSync(dest).size / 1024).toFixed(0) + 'K'
	});
}

console.log(`global darkness ${DARK_MIN.toFixed(3)} .. ${DARK_MAX.toFixed(3)} over ${kept.length} kept paths`);
console.table(report);
console.log('now run: pnpm dlx svgo --config artwork/svgo.config.mjs -f static/plants');
