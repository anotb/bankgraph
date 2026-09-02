/**
 * Browser-only ECharts loaders.
 *
 * Keeping each chart family behind a dynamic import prevents every chart route
 * from hydrating the complete ECharts registry. The promises are shared so a
 * page with several charts of one kind only initializes that registry once.
 */

export type EChartsRuntime = typeof import('echarts/core');
export type { EChartsType } from 'echarts/core';

let barRuntime: Promise<EChartsRuntime> | undefined;
let lineRuntime: Promise<EChartsRuntime> | undefined;
let pieRuntime: Promise<EChartsRuntime> | undefined;
let radarRuntime: Promise<EChartsRuntime> | undefined;

export function loadBarECharts(): Promise<EChartsRuntime> {
	return (barRuntime ??= import('./echarts-bar-runtime.js').then(({ echarts }) => echarts));
}

export function loadLineECharts(): Promise<EChartsRuntime> {
	return (lineRuntime ??= import('./echarts-line-runtime.js').then(({ echarts }) => echarts));
}

export function loadPieECharts(): Promise<EChartsRuntime> {
	return (pieRuntime ??= import('./echarts-pie-runtime.js').then(({ echarts }) => echarts));
}

export function loadRadarECharts(): Promise<EChartsRuntime> {
	return (radarRuntime ??= import('./echarts-radar-runtime.js').then(({ echarts }) => echarts));
}

/** Begin loading when a reserved chart surface is visible or nearly visible. */
export function whenChartIsNearViewport(element: Element, load: () => void): () => void {
	if (typeof IntersectionObserver === 'undefined') {
		load();
		return () => {};
	}

	const observer = new IntersectionObserver(
		(entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			load();
		},
		{ rootMargin: '600px 0px' }
	);

	observer.observe(element);
	return () => observer.disconnect();
}
