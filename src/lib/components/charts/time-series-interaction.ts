import { escapeHtml, safeCssColor } from '$lib/utils/html.js';

export type TimeSeriesAxisFormat = 'currency' | 'percent' | 'number';

export type TooltipSeriesMeta = {
	axisIndex: number;
	unit?: string;
};

export type EChartsTooltipPoint = {
	axisValue?: unknown;
	axisValueLabel?: string;
	color?: unknown;
	data?: unknown;
	name?: string;
	seriesIndex: number;
	seriesName?: string;
	value?: unknown;
};

/** Shared interaction contract for every responsive time-series surface. */
export const TIME_SERIES_TOOLTIP_INTERACTION = {
	trigger: 'axis',
	triggerOn: 'mousemove|click',
	confine: true,
	enterable: true,
	hideDelay: 100,
	transitionDuration: 0,
	order: 'seriesAsc',
	axisPointer: {
		type: 'line',
		snap: true
	}
} as const;

const exactDateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	timeZone: 'UTC'
});

function dateParts(value: unknown): [number, number, number] | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
		}
	}
	if (typeof value !== 'string') return null;
	const text = value.trim();
	let match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
	if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
	match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
	if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
	match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
	if (match) return [Number(match[3]), Number(match[1]), Number(match[2])];
	return null;
}

function validDate(parts: [number, number, number]): Date | null {
	const [year, month, day] = parts;
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() + 1 !== month ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return date;
}

/** Normalize supported reporting-date forms without allowing the local timezone to shift the day. */
export function normalizeChartDate(value: unknown): string {
	const parts = dateParts(value);
	const date = parts ? validDate(parts) : null;
	if (!date) return typeof value === 'string' ? value : String(value ?? '');
	return date.toISOString().slice(0, 10);
}

/** Format the full reporting date shown in the hover/focus readout. */
export function formatExactChartDate(value: unknown): string {
	const parts = dateParts(value);
	const date = parts ? validDate(parts) : null;
	if (!date) return typeof value === 'string' ? value : String(value ?? '');
	return exactDateFormatter.format(date);
}

export function tooltipPointDate(point: EChartsTooltipPoint): unknown {
	if (Array.isArray(point.value) && point.value.length > 0) return point.value[0];
	if (Array.isArray(point.data) && point.data.length > 0) return point.data[0];
	return point.axisValue ?? point.name ?? point.axisValueLabel ?? '';
}

export function tooltipPointValue(point: EChartsTooltipPoint): number | null {
	const candidates = [
		Array.isArray(point.value) ? point.value[1] : point.value,
		Array.isArray(point.data) ? point.data[1] : point.data
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
		if (typeof candidate === 'string' && candidate.trim() !== '') {
			const numeric = Number(candidate);
			if (Number.isFinite(numeric)) return numeric;
		}
	}
	return null;
}

export function buildTimeSeriesTooltipHtml(
	params: EChartsTooltipPoint[],
	metaBySeries: ReadonlyMap<number, TooltipSeriesMeta>,
	formatValue: (value: number, axisIndex: number) => string,
	textSecondary: string
): string {
	const rows = params.flatMap((point) => {
		const value = tooltipPointValue(point);
		if (value === null) return [];
		const meta = metaBySeries.get(point.seriesIndex) ?? { axisIndex: 0 };
		return [{ point, value, meta }];
	});
	if (rows.length === 0) return '';

	const date = formatExactChartDate(tooltipPointDate(rows[0].point));
	let html = `<div style="font-weight:650;margin-bottom:5px;font-size:12px">${escapeHtml(date)}</div>`;
	for (const { point, value, meta } of rows) {
		const formatted = formatValue(value, meta.axisIndex);
		html += '<div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:baseline;column-gap:7px;margin:3px 0;font-size:12px">';
		html += `<span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${safeCssColor(point.color)}"></span>`;
		html += `<span style="min-width:0;overflow-wrap:anywhere;color:${safeCssColor(textSecondary)}">${escapeHtml(point.seriesName ?? 'Series')}</span>`;
		html += `<span style="white-space:nowrap;font-weight:650;font-variant-numeric:tabular-nums">${escapeHtml(formatted)}`;
		if (meta.unit) {
			html += ` <span style="font-weight:400;color:${safeCssColor(textSecondary)}">${escapeHtml(meta.unit)}</span>`;
		}
		html += '</span></div>';
	}
	return html;
}

/** Keep the readout close to the selected observation while avoiding the pointer and chart edges. */
export function timeSeriesTooltipPosition(
	point: [number, number],
	contentSize: [number, number],
	viewSize: [number, number]
): [number, number] {
	const [pointX, pointY] = point;
	const [contentWidth, contentHeight] = contentSize;
	const [viewWidth, viewHeight] = viewSize;
	const gutter = 8;
	const offset = 14;
	const boundedWidth = Math.min(contentWidth, Math.max(0, viewWidth - gutter * 2));
	const boundedHeight = Math.min(contentHeight, Math.max(0, viewHeight - gutter * 2));

	let left = pointX + offset;
	if (left + boundedWidth > viewWidth - gutter) left = pointX - boundedWidth - offset;
	left = Math.max(gutter, Math.min(left, Math.max(gutter, viewWidth - boundedWidth - gutter)));

	let top = pointY - boundedHeight / 2;
	top = Math.max(gutter, Math.min(top, Math.max(gutter, viewHeight - boundedHeight - gutter)));
	return [left, top];
}

export function interactiveReportingDates(
	series: Array<{ data: Array<{ date: string; value: number | null }> }>
): string[] {
	return [
		...new Set(
			series.flatMap((item) =>
				item.data
					.filter((point) => point.value !== null && Number.isFinite(point.value))
					.map((point) => normalizeChartDate(point.date))
			)
		)
	].sort();
}
