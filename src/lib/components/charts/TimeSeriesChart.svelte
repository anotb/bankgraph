<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber } from '$lib/utils/formatters.js';
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';
	import { echarts } from './echarts-setup.js';
	import { getCSSVar, getChartPalette } from '$lib/utils/chart-colors.js';

	type SeriesDataPoint = { date: string; value: number | null };
	type SeriesConfig = {
		key: string;
		label: string;
		color?: string;
		data: SeriesDataPoint[];
		/** Which y-axis this series binds to: 0 (left, default) or 1 (right) */
		yAxisIndex?: number;
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

	let dark = $derived(getIsDark());

	// Check if there's sufficient data to render a meaningful chart
	let totalDataPoints = $derived(
		series.reduce((sum, s) => sum + s.data.filter((d) => d.value !== null).length, 0)
	);
	let hasEnoughData = $derived(totalDataPoints > 1);

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

	/** Parse YYYYMMDD to ISO date string for ECharts */
	function parseDate(dateStr: string): string {
		const y = dateStr.slice(0, 4);
		const m = dateStr.slice(4, 6);
		const d = dateStr.slice(6, 8);
		return `${y}-${m}-${d}`;
	}

	$effect(() => {
		// Track series and mode reactively
		const currentSeries = series;
		const isDark = dark;
		const enoughData = hasEnoughData;
		let disposed = false;

		// If insufficient data, dispose chart and bail
		if (!enoughData) {
			if (chart) {
				chart.dispose();
				chart = undefined;
			}
			return () => { disposed = true; };
		}

		if (!chartContainer) return;

		{
			if (!chart) {
				chart = echarts.init(chartContainer);
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

			// Build a map from ECharts series index -> yAxisIndex for tooltip formatting
			const seriesAxisMap = new Map<number, number>();

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
						type: 'cross',
						crossStyle: {
							color: textDisabled,
							type: 'dashed',
							width: 1
						},
						lineStyle: {
							color: textDisabled,
							type: 'dashed',
							width: 1
						},
						label: {
							show: false
						}
					},
					formatter: (params: any[]) => {
						if (!params.length) return '';
						const dateStr = params[0].axisValueLabel;
						let html = `<div style="font-weight:600;margin-bottom:4px;font-size:12px">${dateStr}</div>`;
						for (const p of params) {
							if (p.value == null || p.value[1] == null) continue;
							// Use the yAxisIndex from the ECharts series config via seriesIndex lookup
							const axisIdx = seriesAxisMap.get(p.seriesIndex) ?? 0;
							const formatted = formatByAxis(p.value[1], axisIdx);
							html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:12px">`;
							html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
							html += `<span style="color:${textSecondary}">${p.seriesName}</span>`;
							html += `<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${formatted}</span>`;
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
							const month = d.getMonth();
							if (month === 0) return String(d.getFullYear());
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
						const chartData = s.data
							.filter((d) => d.value !== null)
							.map((d) => [parseDate(d.date), d.value] as [string, number | null]);

						const fewPoints = chartData.length <= 3;
						const base: any = {
							name: s.label,
							type: 'line',
							yAxisIndex: s.yAxisIndex ?? 0,
							symbolSize: fewPoints ? 6 : 4,
							symbol: fewPoints ? 'circle' : 'none',
							showSymbol: fewPoints,
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
						seriesAxisMap.set(allSeries.length, s.yAxisIndex ?? 0);
						allSeries.push(base);

						// Add SMA overlay if enabled and enough data
						if (showMovingAverage && chartData.length > SMA_PERIOD) {
							const smaData = computeSMA(chartData, SMA_PERIOD);
							seriesAxisMap.set(allSeries.length, s.yAxisIndex ?? 0);
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
	<div bind:this={chartContainer} style="width:100%;height:{height}" aria-hidden="true"></div>
	<p class="sr-only">Time series chart with {series.length} {series.length === 1 ? 'series' : 'series'}. Use the data table for exact values.</p>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		Insufficient data
	</div>
{/if}
