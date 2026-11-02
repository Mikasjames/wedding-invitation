#!/usr/bin/env node
/**
 * Measure the envelope reveal the same way the perf commits describe it:
 * Chromium, CPU throttled, with compositor draw totals grouped by reveal phase.
 *
 * Usage:
 *   pnpm build
 *   pnpm preview --port 4173
 *   node scripts/perf-envelope.mjs
 *
 * Override with PERF_URL, PERF_CPU, PERF_VIEWPORT=375x812, PERF_TRACE.
 * This is a dev-only reporting tool, not a CI gate: frame timings are noisy.
 */
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.PERF_URL ?? 'http://localhost:4173/envelope/';
const cpuRate = Number(process.env.PERF_CPU ?? 6);
const [width, height] = (process.env.PERF_VIEWPORT ?? '375x812')
	.split('x')
	.map(Number);
const tracePath = process.env.PERF_TRACE ?? join(tmpdir(), 'envelope-trace.json');

try {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
	console.error(`Cannot reach ${url}. Run "pnpm build && pnpm preview --port 4173" first.`);
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
	viewport: { width, height },
	reducedMotion: 'no-preference'
});
const page = await context.newPage();

try {
	await page.goto(url, { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready);
	await page.waitForFunction(() =>
		[...document.images].every((image) => image.complete && image.naturalWidth > 0)
	);
	// Let any page-load entrance animations settle before measuring.
	await page.waitForTimeout(1200);

	const cdp = await context.newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });

	const events = [];
	cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
	const tracingComplete = new Promise((resolve) => {
		cdp.once('Tracing.tracingComplete', resolve);
	});

	await cdp.send('Tracing.start', {
		categories: [
			'devtools.timeline',
			'disabled-by-default-devtools.timeline',
			'disabled-by-default-devtools.timeline.frame',
			'blink.user_timing'
		].join(','),
		options: 'sampling-frequency=10000',
		transferMode: 'ReportEvents'
	});

	await page.evaluate(() => {
		performance.mark('perf:start');
		window.addEventListener('click', () => performance.mark('perf:click'), {
			capture: true,
			once: true
		});

		const card = document.querySelector('[data-card]');
		if (!card) throw new Error('no envelope on the page');

		new MutationObserver((records) => {
			for (const record of records) {
				if (record.attributeName === 'data-phase') {
					performance.mark(`perf:phase:${card.getAttribute('data-phase')}`);
				}
			}
		}).observe(card, { attributes: true, attributeFilter: ['data-phase'] });
	});

	await page.getByRole('button', { name: 'Open the invitation' }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-card]')?.getAttribute('data-phase') === 'gone'
	);
	await page.waitForTimeout(800);
	await page.evaluate(() => performance.mark('perf:end'));

	await cdp.send('Tracing.end');
	await tracingComplete;

	await writeFile(tracePath, JSON.stringify(events));

	const marks = new Map();
	for (const event of events) {
		if (typeof event.name === 'string' && event.name.startsWith('perf:') && event.ts) {
			marks.set(event.name, event.ts);
		}
	}

	const windows = [
		['click', 'perf:click', 'perf:phase:breaking'],
		['breaking', 'perf:phase:breaking', 'perf:phase:flap'],
		['flap', 'perf:phase:flap', 'perf:phase:letter'],
		['letter', 'perf:phase:letter', 'perf:phase:leaving'],
		['leaving', 'perf:phase:leaving', 'perf:phase:gone'],
		['post', 'perf:phase:gone', 'perf:end']
	];

	const missing = windows.flatMap(([, from, to]) =>
		[from, to].filter((name) => !marks.has(name))
	);
	if (missing.length) {
		throw new Error(
			`missing trace marks: ${[...new Set(missing)].join(', ')}. ` +
				'Open the saved trace to inspect available event names.'
		);
	}

	const completed = (name) =>
		events.filter((event) => event.name === name && event.ph === 'X' && event.dur != null);

	// In this Chromium the compositor's DrawFrame is an instant marker, so use
	// the draw slice it brackets. It is the same work the old traces called
	// DrawFrame: raster/composite up to swap.
	const drawFrames = [];
	const openDraws = new Map();
	for (const event of events) {
		if (event.name !== 'StartDrawToSwapStart') continue;
		const key = event.id2 ? JSON.stringify(event.id2) : String(event.id);
		if (event.ph === 'b') {
			openDraws.set(key, event);
		} else if (event.ph === 'e' && openDraws.has(key)) {
			const start = openDraws.get(key);
			openDraws.delete(key);
			drawFrames.push({ ts: start.ts, dur: event.ts - start.ts });
		}
	}

	const paints = completed('Paint');
	const layouts = completed('Layout');
	const layerUpdates = completed('Layerize');
	const tasks = completed('RunTask');

	const inWindow = (event, from, to) => event.ts >= from && event.ts < to;
	const summarize = (items, from, to) => {
		const selected = items.filter((event) => inWindow(event, from, to));
		const total = selected.reduce((sum, event) => sum + event.dur / 1000, 0);
		const longest = selected.reduce((max, event) => Math.max(max, event.dur / 1000), 0);
		const over8 = selected.filter((event) => event.dur > 8000).length;
		return { total, longest, over8, count: selected.length };
	};

	const rows = windows.map(([label, fromName, toName]) => {
		const from = marks.get(fromName);
		const to = marks.get(toName);
		const draw = summarize(drawFrames, from, to);
		const paint = summarize(paints, from, to);
		const layout = summarize(layouts, from, to);
		const layers = summarize(layerUpdates, from, to);
		const task = summarize(tasks, from, to);
		const longTasks = tasks.filter((event) => inWindow(event, from, to) && event.dur > 50000).length;
		return { label, draw, paint, layout, layers, task, longTasks, ms: (to - from) / 1000 };
	});

	const pad = (value, width) => String(value).padStart(width);
	console.log(
		`Envelope reveal @ ${cpuRate}x CPU throttle, ${width}x${height} — ${url}`
	);
	console.log(
		[
			'window'.padEnd(10),
			pad('span', 8),
			pad('draw', 8),
			pad('>8ms', 6),
			pad('paint', 8),
			pad('layout', 8),
			pad('layers', 8),
			pad('task', 8),
			pad('long', 6)
		].join(' ')
	);
	for (const row of rows) {
		console.log(
			[
				row.label.padEnd(10),
				pad(row.ms.toFixed(1), 8),
				pad(row.draw.total.toFixed(1), 8),
				pad(row.draw.over8, 6),
				pad(row.paint.total.toFixed(1), 8),
				pad(row.layout.total.toFixed(1), 8),
				pad(row.layers.total.toFixed(1), 8),
				pad(row.task.total.toFixed(1), 8),
				pad(row.longTasks, 6)
			].join(' ')
		);
	}
	console.log(`\nraw trace: ${tracePath}`);
} finally {
	await browser.close();
}
