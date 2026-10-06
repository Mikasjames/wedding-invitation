import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const wedding = {
	names: 'Michal &amp; Lemuel',
	dateLabel: 'Saturday, 12 June 2027',
	city: 'Tanza, Cavite'
};

const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
	<rect width="1200" height="630" fill="#ebded5"/>
	<rect x="20" y="20" width="1160" height="590" fill="none" stroke="#74838f" stroke-width="2"/>
	<text x="600" y="270" text-anchor="middle" font-family="serif" font-size="64" fill="#3e4854" font-style="italic">${wedding.names}</text>
	<text x="600" y="350" text-anchor="middle" font-family="serif" font-size="32" fill="#74838f">${wedding.dateLabel}</text>
	<text x="600" y="400" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#9ba3ac">${wedding.city}</text>
</svg>`;

mkdirSync(join(import.meta.dirname, '..', 'static', 'images'), { recursive: true });
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
writeFileSync(join(import.meta.dirname, '..', 'static', 'images', 'og.png'), resvg.render().asPng());
console.log('wrote static/images/og.png');
