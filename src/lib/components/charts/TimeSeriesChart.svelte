<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber } from '$lib/utils/formatters.js';
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';
	import {
		loadLineECharts,
		whenChartIsNearViewport,
		type EChartsRuntime
	} from './echarts-setup.js';
	import { getCSSVar, getChartPalette } from '$lib/utils/chart-colors.js';
	import {
		buildTimeSeriesTooltipHtml,
		formatExactChartDate,
		interactiveReportingDates,
		normalizeChartDate,
		TIME_SERIES_TOOLTIP_INTERACTION,
		timeSeriesTooltipPosition,
		type EChartsTooltipPoint,
		type TooltipSeriesMeta
	} from './time-series-interaction.js';

	type SeriesDataPoint = { date: string; value: number | null };
	type SeriesConfig = {
		key: string;
		label: string;
		color?: string;
		data: SeriesDataPoint[];
		/** Which y-axis this series binds to: 0 (left, default) or 1 (right) */
		yAxisIndex?: number;
		/** Exact unit label used beside values in the inspectable tooltip. */
		unit?: string;
	};
	type MarkAreaRange = [string, string]; // [start ISO date, end ISO date]
	type MarkLineConfig = { value: number; label?: string };

	let {
		series,
		title,
		yAxisFormat = 'number',
		height = '320px',
		markAreas = [],
		markLines = [],
		showMovingAverage = false,
		yAxisMin,
		yAxisMax,
		yAxisFormatter,
		yAxisUnit,
		dualAxis,
	}: {
		series: SeriesConfig[];
		title?: string;
		yAxisFormat?: 'currency' | 'percent' | 'number';
		height?: string;
		markAreas?: MarkAreaRange[];
		markLines?: MarkLineConfig[];
		showMovingAverage?: boolean;
		yAxisMin?: number;
		yAxisMax?: number;
		yAxisFormatter?: (value: number) => string;
		/** Unit label for left-axis series when the formatted value does not make it explicit. */
		yAxisUnit?: string;
		/** Configuration for a second (right) y-axis */
		dualAxis?: {
			format: 'currency' | 'percent' | 'number';
			label?: string;
			formatter?: (value: number) => string;
			min?: number;
			max?: number;
		};
	} = $props();

	let chartContainer = $state<HTMLDivElement | null>(null);
	let chart: any;
	let chartRuntime = $state<EChartsRuntime | null>(null);
	let chartLoadState = $state<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
	let activeDateIndex = $state(-1);
	let activeReadout = $state('');
	let keyboardDateTargets = new Map<string, { seriesIndex: number; dataIndex: number }>();

	let dark = $derived(getIsDark());

	// Check if there's sufficient data to render a meaningful chart
	let totalDataPoints = $derived(
		series.reduce((sum, s) => sum + s.data.filter((d) => d.value !== null).length, 0)
	);
	let hasEnoughData = $derived(totalDataPoints > 1);
	let keyboardDates = $derived(interactiveReportingDates(series));

	function defaultAxisUnit(axisIndex: number): string | undefined {
		if (axisIndex === 1) {
			if (dualAxis?.label) return dualAxis.label;
			return dualAxis?.format === 'currency' ? 'USD' : undefined;
		}
		if (yAxisUnit) return yAxisUnit;
		return yAxisFormat === 'currency' ? 'USD' : undefined;
	}

	function formatYValue(value: number): string {
		if (yAxisFormatter) return yAxisFormatter(value);
		switch (yAxisFormat) {
			case 'currency':
				return formatCurrency(value);
			case 'percent':
				return formatPercent(value);
			case 'number':
				return formatNumber(value);
			default:
				return String(value);
		}
	}

	function formatRightYValue(value: number): string {
		if (dualAxis?.formatter) return dualAxis.formatter(value);
		switch (dualAxis?.format) {
			case 'currency':
				return formatCurrency(value);
			case 'percent':
				return formatPercent(value);
			case 'number':
				return formatNumber(value);
			default:
				return String(value);
		}
	}

	/** Format a value based on which axis index it belongs to */
	function formatByAxis(value: number, axisIndex: number): string {
		return axisIndex === 1 ? formatRightYValue(value) : formatYValue(value);
	}

	/** Compute a simple moving average over `period` data points */
	function computeSMA(
		data: Array<[string, number | null]>,
		period: number
	): Array<[string, number]> {
		const result: Array<[string, number]> = [];
		for (let i = period - 1; i < data.length; i++) {
			let sum = 0;
			let count = 0;
			for (let j = i - period + 1; j <= i; j++) {
				const val = data[j][1];
				if (val !== null) {
					sum += val;
					count++;
				}
			}
			if (count === period) {
				result.push([data[i][0], sum / period]);
			}
		}
		return result;
	}

	function readoutForDate(date: string): string {
		const rows = series.flatMap((item) => {
			const point = item.data.find(
				(candidate) => normalizeChartDate(candidate.date) === date && candidate.value !== null
			);
			if (point?.value === null || point?.value === undefined) return [];
			const axisIndex = item.yAxisIndex ?? 0;
			const unit = item.unit ?? defaultAxisUnit(axisIndex);
			return [`${item.label}: ${formatByAxis(point.value, axisIndex)}${unit ? ` ${unit}` : ''}`];
		});
		return `${formatExactChartDate(date)}. ${rows.join('. ')}`;
	}

	function showKeyboardDate(index: number): void {
		if (keyboardDates.length === 0) return;
		activeDateIndex = Math.max(0, Math.min(index, keyboardDates.length - 1));
		const date = keyboardDates[activeDateIndex];
		activeReadout = readoutForDate(date);
		const target = keyboardDateTargets.get(date);
		if (target && chart) {
			chart.dispatchAction({ type: 'showTip', ...target });
		}
	}

	function handleChartFocus(): void {
		showKeyboardDate(activeDateIndex >= 0 ? activeDateIndex : keyboardDates.length - 1);
	}

	function handleChartBlur(): void {
		chart?.dispatchAction({ type: 'hideTip' });
	}

	function handleChartKeydown(event: KeyboardEvent): void {
		if (keyboardDates.length === 0) return;
		const current = activeDateIndex >= 0 ? activeDateIndex : keyboardDates.length - 1;
		let next = current;
		if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
		else if (event.key === 'ArrowRight') next = Math.min(keyboardDates.length - 1, current + 1);
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = keyboardDates.length - 1;
		else if (event.key === 'Enter' || event.key === ' ') next = current;
		else if (event.key === 'Escape') {
			chart?.dispatchAction({ type: 'hideTip' });
			return;
		} else return;
		event.preventDefault();
		showKeyboardDate(next);
	}

	$effect(() => {
		const element = chartContainer;
		if (!element) return;

		let active = true;
		const stopObserving = whenChartIsNearViewport(element, () => {
			chartLoadState = 'loading';
			void loadLineECharts()
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
		// Track series and mode reactively
		const currentSeries = series;
		const isDark = dark;
		const enoughData = hasEnoughData;
		const runtime = chartRuntime;
		let disposed = false;

		// If insufficient data, dispose chart and bail
		if (!enoughData) {
			if (chart) {
				chart.dispose();
				chart = undefined;
			}
			return () => { disposed = true; };
		}

		if (!chartContainer || !runtime) return;

		{
			if (!chart) {
				chart = runtime.init(chartContainer);
			}

			// Read all colors at render time from the active theme
			const colors = getChartPalette();
			const surface0 = getCSSVar('--surface-0');
			const surface1 = getCSSVar('--surface-1');
			const border = getCSSVar('--border');
			const borderMuted = getCSSVar('--border-muted');
			const textPrimary = getCSSVar('--text-primary');
			const textSecondary = getCSSVar('--text-secondary');
			const textTertiary = getCSSVar('--text-tertiary');
			const textDisabled = getCSSVar('--text-disabled');
			const accent = getCSSVar('--accent');
			const accentFiller = isDark ? 'rgba(45,181,168,0.15)' : 'rgba(13,125,125,0.1)';
			const accentArea = isDark ? 'rgba(45,181,168,0.08)' : 'rgba(13,125,125,0.06)';
			const accentAreaSelected = isDark ? 'rgba(45,181,168,0.15)' : 'rgba(13,125,125,0.12)';

			// Keep tooltip and keyboard inspection bound to the same series metadata.
			const seriesMetaMap = new Map<number, TooltipSeriesMeta>();
			const dateTargets = new Map<string, { seriesIndex: number; dataIndex: number }>();

			const option: any = {
				backgroundColor: 'transparent',
				animation: true,
				animationDuration: 400,
				animationEasing: 'cubicOut',
				title: title
					? {
							text: title,
							left: 'left',
							textStyle: {
								fontSize: 15,
								fontWeight: 600,
								color: textPrimary,
								fontFamily: "'Inter', system-ui, sans-serif"
							}
						}
					: undefined,
				tooltip: {
					...TIME_SERIES_TOOLTIP_INTERACTION,
					backgroundColor: surface1,
					borderColor: border,
					borderWidth: 1,
					textStyle: {
						color: textPrimary,
						fontSize: 12,
						fontFamily: "'Inter', system-ui, sans-serif"
					},
					extraCssText: isDark
						? 'max-width:min(320px,calc(100vw - 24px));max-height:calc(100% - 16px);overflow-y:auto;overscroll-behavior:contain;pointer-events:auto;border-radius:0;box-shadow:0 18px 32px rgba(0,0,0,0.34);'
						: 'max-width:min(320px,calc(100vw - 24px));max-height:calc(100% - 16px);overflow-y:auto;overscroll-behavior:contain;pointer-events:auto;border-radius:0;box-shadow:var(--shadow-lg);',
					axisPointer: {
						...TIME_SERIES_TOOLTIP_INTERACTION.axisPointer,
						lineStyle: {
							color: textDisabled,
							type: 'dashed',
							width: 1
						},
						label: {
							show: false
						}
					},
					position: (point: [number, number], _params: unknown, _dom: unknown, _rect: unknown, size: { contentSize: [number, number]; viewSize: [number, number] }) =>
						timeSeriesTooltipPosition(point, size.contentSize, size.viewSize),
					formatter: (params: EChartsTooltipPoint | EChartsTooltipPoint[]) =>
						buildTimeSeriesTooltipHtml(
							Array.isArray(params) ? params : [params],
							seriesMetaMap,
							formatByAxis,
							textSecondary
						)
				},
				legend: {
					bottom: 0,
					itemWidth: 12,
					itemHeight: 8,
					itemGap: 16,
					textStyle: {
						fontSize: 11,
						color: textSecondary
					},
					// Hide SMA series from legend
					data: currentSeries.map((s) => s.label)
				},
				grid: {
					left: 8,
					right: dualAxis ? 16 : 8,
					top: title ? 40 : 12,
					bottom: 60,
					containLabel: true
				},
				dataZoom: [
					{
						type: 'inside',
						start: 0,
						end: 100,
						minValueSpan: 86400000 * 30 // minimum 30 days zoom
					},
					{
						type: 'slider',
						start: 0,
						end: 100,
						height: 16,
						bottom: 24,
						borderColor: border,
						backgroundColor: surface0,
						fillerColor: accentFiller,
						handleStyle: {
							color: accent,
							borderColor: accent
						},
						moveHandleSize: 4,
						dataBackground: {
							lineStyle: { color: border, width: 0.5 },
							areaStyle: { color: accentArea }
						},
						selectedDataBackground: {
							lineStyle: { color: accent, width: 0.5 },
							areaStyle: { color: accentAreaSelected }
						},
						textStyle: {
							color: textTertiary,
							fontSize: 10
						}
					}
				],
				xAxis: {
					type: 'time',
					axisLine: { lineStyle: { color: border } },
					axisTick: { lineStyle: { color: border } },
					axisLabel: {
						color: textTertiary,
						fontSize: 11,
						fontFamily: "'Inter', system-ui, sans-serif",
						formatter: (value: number) => {
							const d = new Date(value);
							const month = d.getUTCMonth();
							if (month === 0) return String(d.getUTCFullYear());
							const quarters: Record<number, string> = { 2: 'Q1', 5: 'Q2', 8: 'Q3', 11: 'Q4' };
							return quarters[month] || '';
						}
					},
					splitLine: { show: false }
				},
				yAxis: dualAxis
				? [
					{
						type: 'value',
						min: yAxisMin,
						max: yAxisMax,
						axisLine: { show: false },
						axisTick: { show: false },
						axisLabel: {
							color: textTertiary,
							fontSize: 11,
							fontFamily: "'Inter', system-ui, sans-serif",
							formatter: (value: number) => formatYValue(value)
						},
						splitLine: { lineStyle: { color: borderMuted, type: 'dashed' } }
					},
					{
						type: 'value',
						min: dualAxis.min,
						max: dualAxis.max,
						axisLine: { show: false },
						axisTick: { show: false },
						axisLabel: {
							color: textTertiary,
							fontSize: 11,
							fontFamily: "'Inter', system-ui, sans-serif",
							formatter: (value: number) => formatRightYValue(value)
						},
						splitLine: { show: false }
					}
				]
				: {
					type: 'value',
					min: yAxisMin,
					max: yAxisMax,
					axisLine: { show: false },
					axisTick: { show: false },
					axisLabel: {
						color: textTertiary,
						fontSize: 11,
						fontFamily: "'Inter', system-ui, sans-serif",
						formatter: (value: number) => formatYValue(value)
					},
					splitLine: { lineStyle: { color: borderMuted, type: 'dashed' } }
				},
				series: (() => {
					const SMA_PERIOD = 4;
					const allSeries: any[] = [];

					currentSeries.forEach((s, i) => {
						const seriesColor = s.color || colors[i % colors.length];
						// Retain missing observations so the line breaks instead of implying continuity.
						const chartData = s.data.map(
							(d) => [normalizeChartDate(d.date), d.value] as [string, number | null]
						);
						const observationCount = chartData.reduce(
							(count, [, value]) => count + (value === null ? 0 : 1),
							0
						);

						const fewPoints = observationCount <= 3;
						const base: any = {
							name: s.label,
							type: 'line',
							yAxisIndex: s.yAxisIndex ?? 0,
							symbolSize: fewPoints ? 6 : 4,
							symbol: fewPoints ? 'circle' : 'none',
							showSymbol: fewPoints,
							connectNulls: false,
							smooth: false,
							lineStyle: { width: 2, color: seriesColor },
							itemStyle: { color: seriesColor },
							emphasis: {
								focus: 'series',
								lineStyle: { width: 3 },
								itemStyle: { borderWidth: 2 }
							},
							blur: {
								lineStyle: { width: 1, opacity: 0.2 },
								itemStyle: { opacity: 0.2 }
							},
							data: chartData
						};
						// Add horizontal reference lines to the first series only
						if (i === 0 && markLines.length > 0) {
							base.markLine = {
								silent: true,
								symbol: 'none',
								label: {
									fontSize: 10,
									color: textTertiary,
									position: 'insideEndTop',
									fontFamily: "'Inter', system-ui, sans-serif"
								},
								lineStyle: {
									type: 'dashed',
									width: 1,
									color: borderMuted
								},
								data: markLines.map((ml) => ({
									yAxis: ml.value,
									label: ml.label ? { formatter: ml.label } : { show: false }
								}))
							};
						}
						// Add recession bands to the first series only
						if (i === 0 && markAreas.length > 0) {
							base.markArea = {
								silent: true,
								itemStyle: {
									color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
								},
								data: markAreas.map(([start, end]) => [
									{ xAxis: start },
									{ xAxis: end }
								])
							};
						}
						const baseSeriesIndex = allSeries.length;
						seriesMetaMap.set(baseSeriesIndex, {
							axisIndex: s.yAxisIndex ?? 0,
							unit: s.unit ?? defaultAxisUnit(s.yAxisIndex ?? 0)
						});
						chartData.forEach(([date, value], dataIndex) => {
							if (value === null) return;
							if (!dateTargets.has(date)) dateTargets.set(date, { seriesIndex: baseSeriesIndex, dataIndex });
						});
						allSeries.push(base);

						// Add SMA overlay if enabled and enough data
						if (showMovingAverage && observationCount > SMA_PERIOD) {
							const smaData = computeSMA(chartData, SMA_PERIOD);
							seriesMetaMap.set(allSeries.length, {
								axisIndex: s.yAxisIndex ?? 0,
								unit: s.unit ?? defaultAxisUnit(s.yAxisIndex ?? 0)
							});
							allSeries.push({
								name: `${s.label} (${SMA_PERIOD}Q SMA)`,
								type: 'line',
								yAxisIndex: s.yAxisIndex ?? 0,
								symbol: 'none',
								smooth: false,
								lineStyle: {
									type: 'dashed',
									width: 1.5,
									color: seriesColor,
									opacity: 0.6
								},
								itemStyle: { color: seriesColor, opacity: 0.6 },
								emphasis: {
									focus: 'series',
									lineStyle: { width: 2 }
								},
								blur: {
									lineStyle: { width: 1, opacity: 0.1 },
									itemStyle: { opacity: 0.1 }
								},
								data: smaData
							});
						}
					});

					return allSeries;
				})()
			};

			chart.setOption(option, true);
			keyboardDateTargets = dateTargets;
			if (chartContainer === document.activeElement) {
				showKeyboardDate(activeDateIndex >= 0 ? activeDateIndex : keyboardDates.length - 1);
			}
		}

		return () => {
			disposed = true;
		};
	});

	// Separate effect for ResizeObserver so it doesn't re-run on data changes
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

{#if hasEnoughData}
	<div class="relative" style="width:100%;height:{height}">
		<div
			bind:this={chartContainer}
			class="chart-interaction"
			style="width:100%;height:100%"
			role="slider"
			tabindex="0"
			aria-label={`${title ? `${title}. ` : ''}Inspect ${series.length === 1 ? series[0]?.label ?? 'the time series' : `${series.length} time series`} by reporting date`}
			aria-valuemin="0"
			aria-valuemax={Math.max(keyboardDates.length - 1, 0)}
			aria-valuenow={Math.max(0, Math.min(activeDateIndex, Math.max(keyboardDates.length - 1, 0)))}
			aria-valuetext={activeReadout || 'Use Left and Right arrow keys to inspect exact reporting dates and values'}
			aria-keyshortcuts="ArrowLeft ArrowRight Home End"
			onfocus={handleChartFocus}
			onblur={handleChartBlur}
			onkeydown={handleChartKeydown}
		></div>
		{#if chartLoadState === 'loading'}
			<p class="sr-only" role="status">Loading chart</p>
		{:else if chartLoadState === 'error'}
			<p class="absolute inset-0 flex items-center justify-center text-[12px] text-[--text-tertiary]" role="alert">
				Chart unavailable. Reload or use the exact values table.
			</p>
		{/if}
	</div>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		Insufficient data
	</div>
{/if}

<style>
	.chart-interaction {
		border-radius: 0;
	}

	.chart-interaction:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
