<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber } from '$lib/utils/formatters.js';
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';

	type SeriesDataPoint = { date: string; value: number | null };
	type SeriesConfig = {
		key: string;
		label: string;
		color?: string;
		data: SeriesDataPoint[];
	};
	type MarkAreaRange = [string, string]; // [start ISO date, end ISO date]

	let {
		series,
		title,
		yAxisFormat = 'number',
		height = '320px',
		markAreas = []
	}: {
		series: SeriesConfig[];
		title?: string;
		yAxisFormat?: 'currency' | 'percent' | 'number';
		height?: string;
		markAreas?: MarkAreaRange[];
	} = $props();

	let chartContainer: HTMLDivElement;
	let chart: any;

	let dark = $derived(getIsDark());

	// Check if there's sufficient data to render a meaningful chart
	let totalDataPoints = $derived(
		series.reduce((sum, s) => sum + s.data.filter((d) => d.value !== null).length, 0)
	);
	let hasEnoughData = $derived(totalDataPoints > 1);

	const lightColors = [
		'#0d7d7d', '#c53d2f', '#6b5ce7', '#c48a00', '#1a8a4a',
		'#c44e8a', '#4a82c4', '#7da82e', '#b04e6e', '#3e9a8a'
	];

	const darkColors = [
		'#2db5a8', '#e07060', '#8b7ef0', '#e0a620', '#34c772',
		'#e070a8', '#6aa0e0', '#a0c850', '#d07090', '#5ec0aa'
	];

	function formatYValue(value: number): string {
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

		import('echarts').then((echarts) => {
			if (disposed || !chartContainer) return;

			if (!chart) {
				chart = echarts.init(chartContainer);
			}
			const colors = isDark ? darkColors : lightColors;

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
								color: isDark ? '#e8e5e0' : '#1c1a17',
								fontFamily: "'Inter', system-ui, sans-serif"
							}
						}
					: undefined,
				tooltip: {
					trigger: 'axis',
					backgroundColor: isDark ? '#22262f' : '#ffffff',
					borderColor: isDark ? '#383c44' : '#d6d2cb',
					borderWidth: 1,
					textStyle: {
						color: isDark ? '#e8e5e0' : '#1c1a17',
						fontSize: 12,
						fontFamily: "'Inter', system-ui, sans-serif"
					},
					extraCssText: isDark
						? 'border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);'
						: 'border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);',
					axisPointer: {
						type: 'cross',
						crossStyle: {
							color: isDark ? '#555961' : '#b5b1ab',
							type: 'dashed',
							width: 1
						},
						lineStyle: {
							color: isDark ? '#555961' : '#b5b1ab',
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
							html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:12px">`;
							html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
							html += `<span style="color:${isDark ? '#a8a39c' : '#6b6660'}">${p.seriesName}</span>`;
							html += `<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${formatYValue(p.value[1])}</span>`;
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
						color: isDark ? '#a8a39c' : '#6b6660'
					}
				},
				grid: {
					left: 8,
					right: 8,
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
						borderColor: isDark ? '#383c44' : '#d6d2cb',
						backgroundColor: isDark ? '#1e222b' : '#f5f3f0',
						fillerColor: isDark ? 'rgba(45,181,168,0.15)' : 'rgba(13,125,125,0.1)',
						handleStyle: {
							color: isDark ? '#2db5a8' : '#0d7d7d',
							borderColor: isDark ? '#2db5a8' : '#0d7d7d'
						},
						moveHandleSize: 4,
						dataBackground: {
							lineStyle: { color: isDark ? '#383c44' : '#d6d2cb', width: 0.5 },
							areaStyle: { color: isDark ? 'rgba(45,181,168,0.08)' : 'rgba(13,125,125,0.06)' }
						},
						selectedDataBackground: {
							lineStyle: { color: isDark ? '#2db5a8' : '#0d7d7d', width: 0.5 },
							areaStyle: { color: isDark ? 'rgba(45,181,168,0.15)' : 'rgba(13,125,125,0.12)' }
						},
						textStyle: {
							color: isDark ? '#7a7e86' : '#948f88',
							fontSize: 10
						}
					}
				],
				xAxis: {
					type: 'time',
					axisLine: { lineStyle: { color: isDark ? '#383c44' : '#d6d2cb' } },
					axisTick: { lineStyle: { color: isDark ? '#383c44' : '#d6d2cb' } },
					axisLabel: {
						color: isDark ? '#7a7e86' : '#948f88',
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
				yAxis: {
					type: 'value',
					axisLine: { show: false },
					axisTick: { show: false },
					axisLabel: {
						color: isDark ? '#7a7e86' : '#948f88',
						fontSize: 11,
						fontFamily: "'Inter', system-ui, sans-serif",
						formatter: (value: number) => formatYValue(value)
					},
					splitLine: { lineStyle: { color: isDark ? '#282c33' : '#e8e5df', type: 'dashed' } }
				},
				series: currentSeries.map((s, i) => {
					const seriesColor = s.color || colors[i % colors.length];
					const base: any = {
						name: s.label,
						type: 'line',
						symbolSize: 4,
						symbol: 'none',
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
						data: s.data
							.filter((d) => d.value !== null)
							.map((d) => [parseDate(d.date), d.value])
					};
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
					return base;
				})
			};

			chart.setOption(option, true);
		});

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
	<div bind:this={chartContainer} style="width:100%;height:{height}"></div>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		Insufficient data
	</div>
{/if}
