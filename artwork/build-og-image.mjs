import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wedding } from '../src/lib/lib/wedding.ts';

/**
 * The card social apps show when the invitation is shared.
 *
 * The names, date and city come from `wedding.ts` rather than being restated
 * here. They used to be restated: this file said "Saturday, 12 June 2027" while
 * the ceremony is on 9 February, so every link previewed a wedding four months
 * after it happened. A generated asset that keeps its own copy of the config is
 * a second source of truth, and this one had already drifted.
 *
 * Node strips the types from `wedding.ts`, so this stays a single `node` command
 * with no build step — the same convention as the other scripts in this folder.
 */
const escapeXml = (text) =>
	text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
	<rect width="1200" height="630" fill="#ebded5"/>
	<rect x="20" y="20" width="1160" height="590" fill="none" stroke="#74838f" stroke-width="2"/>
	<text x="600" y="270" text-anchor="middle" font-family="serif" font-size="64" fill="#3e4854" font-style="italic">${escapeXml(wedding.names)}</text>
	<text x="600" y="350" text-anchor="middle" font-family="serif" font-size="32" fill="#74838f">${escapeXml(wedding.dateLabel)}</text>
	<text x="600" y="400" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#9ba3ac">${escapeXml(wedding.city)}</text>
</svg>`;

mkdirSync(join(import.meta.dirname, '..', 'static', 'images'), { recursive: true });
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
writeFileSync(join(import.meta.dirname, '..', 'static', 'images', 'og.png'), resvg.render().asPng());
console.log(`wrote static/images/og.png (${wedding.dateLabel})`);
