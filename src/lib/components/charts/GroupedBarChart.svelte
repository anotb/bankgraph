<script lang="ts">
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';
	import {
		loadBarECharts,
		whenChartIsNearViewport,
		type EChartsRuntime
	} from './echarts-setup.js';
	import { getCSSVar, getChartPalette } from '$lib/utils/chart-colors.js';
	import { escapeHtml, safeCssColor } from '$lib/utils/html.js';

	type GroupedBarSeries = {
		key: string;
		label: string;
		color?: string;
	};

	type GroupedBarCategory = {
		label: string;
		values: (number | null)[];
	};

	let {
		series,
		categories,
		height = '280px',
		valueFormatter = (v: number) => String(v)
	}: {
		series: GroupedBarSeries[];
		categories: GroupedBarCategory[];
		height?: string;
		valueFormatter?: (v: number) => string;
	} = $props();

	let chartContainer = $state<HTMLDivElement | null>(null);
	let chart: any;
	let chartRuntime = $state<EChartsRuntime | null>(null);
	let chartLoadState = $state<'waiting' | 'loading' | 'ready' | 'error'>('waiting');

	let dark = $derived(getIsDark());

	let hasData = $derived(categories.length > 0 && series.length > 0);

	$effect(() => {
		const element = chartContainer;
		if (!element) return;

		let active = true;
		const stopObserving = whenChartIsNearViewport(element, () => {
			chartLoadState = 'loading';
			void loadBarECharts()
				.then((runtime) => {
					if (!active) return;
					chartRuntime = runtime;
					chartLoadState = 'ready';
				})
				.catch(() => {
					if (active) chartLoadState = 'error';
				});
		});

		return () => {
			active = false;
			stopObserving();
		};
	});

	$effect(() => {
		const currentSeries = series;
		const currentCategories = categories;
		const isDark = dark;
		const runtime = chartRuntime;
		let disposed = false;

		if (!hasData || !chartContainer || !runtime) return;

		{
			if (!chart) {
				chart = runtime.init(chartContainer);
			}

			const colors = getChartPalette();
			const surface1 = getCSSVar('--surface-1');
			const border = getCSSVar('--border');
			const borderMuted = getCSSVar('--border-muted');
			const textPrimary = getCSSVar('--text-primary');
			const textSecondary = getCSSVar('--text-secondary');
			const textTertiary = getCSSVar('--text-tertiary');

			const option: any = {
				backgroundColor: 'transparent',
				animation: true,
				animationDuration: 400,
				animationEasing: 'cubicOut',
				tooltip: {
					trigger: 'axis',
					backgroundColor: surface1,
					borderColor: border,
					borderWidth: 1,
					textStyle: {
						color: textPrimary,
						fontSize: 12,
						fontFamily: "'Inter', system-ui, sans-serif"
					},
					extraCssText: isDark
						? 'border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);'
						: 'border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);',
					axisPointer: {
						type: 'shadow',
						shadowStyle: {
							color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
						}
					},
					formatter: (params: any[]) => {
						if (!params.length) return '';
						let html = `<div style="font-weight:600;margin-bottom:4px;font-size:12px">${escapeHtml(params[0].name)}</div>`;
						for (const p of params) {
							if (p.value == null) continue;
							html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:12px">`;
							html += `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${safeCssColor(p.color)}"></span>`;
							html += `<span style="color:${safeCssColor(textSecondary)}">${escapeHtml(p.seriesName)}</span>`;
							html += `<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${escapeHtml(valueFormatter(p.value))}</span>`;
							html += `</div>`;
						}
						return html;
					}
				},
				legend: {
					bottom: 0,
					itemWidth: 12,
					itemHeight: 8,
					itemGap: 16,
					textStyle: {
						fontSize: 11,
						color: textSecondary
					}
				},
				grid: {
					left: 8,
					right: 8,
					top: 12,
					bottom: 40,
					containLabel: true
				},
				xAxis: {
					type: 'category',
					data: currentCategories.map((c) => c.label),
					axisLine: { lineStyle: { color: border } },
					axisTick: { show: false },
					axisLabel: {
						color: textTertiary,
						fontSize: 11,
						fontFamily: "'Inter', system-ui, sans-serif",
						interval: 0,
						rotate: currentCategories.length > 6 ? 30 : 0
					},
					splitLine: { show: false }
				},
				yAxis: {
					type: 'value',
					axisLine: { show: false },
					axisTick: { show: false },
					axisLabel: {
						color: textTertiary,
						fontSize: 10,
						fontFamily: "'Inter', system-ui, sans-serif",
						formatter: (value: number) => valueFormatter(value)
					},
					splitLine: { lineStyle: { color: borderMuted, type: 'dashed' } }
				},
				series: currentSeries.map((s, i) => ({
					name: s.label,
					type: 'bar',
					data: currentCategories.map((c) => c.values[i] ?? null),
					barMaxWidth: 28,
					itemStyle: {
						color: s.color || colors[i % colors.length],
						borderRadius: [2, 2, 0, 0]
					},
					emphasis: {
						itemStyle: {
							opacity: 0.85
						}
					}
				}))
			};

			chart.setOption(option, true);
		}

		return () => {
			disposed = true;
		};
	});

	$effect(() => {
		if (!chartContainer) return;

		const ro = new ResizeObserver(() => {
			chart?.resize();
		});
		ro.observe(chartContainer);

		return () => {
			ro.disconnect();
			chart?.dispose();
			chart = undefined;
		};
	});
</script>

{#if hasData}
	<div class="relative" style="width:100%;height:{height}">
		<div bind:this={chartContainer} style="width:100%;height:100%" aria-hidden="true"></div>
		{#if chartLoadState === 'loading'}
			<p class="sr-only" role="status">Loading chart</p>
		{:else if chartLoadState === 'error'}
			<p class="absolute inset-0 flex items-center justify-center text-[12px] text-[--text-tertiary]" role="alert">
				Chart unavailable. Reload or use the exact values table.
			</p>
		{/if}
	</div>
	<p class="sr-only">
		Grouped bar chart comparing {series.length} banks across {categories.length} metrics.
		Use the data table for exact values.
	</p>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		No data
	</div>
{/if}
