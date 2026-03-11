<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber } from '$lib/utils/formatters.js';

	type SeriesDataPoint = { date: string; value: number | null };
	type SeriesConfig = {
		key: string;
		label: string;
		color: string;
		data: SeriesDataPoint[];
	};

	let {
		series,
		title,
		yAxisFormat = 'number',
		height = '320px'
	}: {
		series: SeriesConfig[];
		title?: string;
		yAxisFormat?: 'currency' | 'percent' | 'number';
		height?: string;
	} = $props();

	let chartContainer: HTMLDivElement;
	let chart: any;

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
		// Track series reactively so the chart updates when data changes
		const currentSeries = series;
		let disposed = false;

		import('echarts').then((echarts) => {
			if (disposed || !chartContainer) return;

			if (!chart) {
				chart = echarts.init(chartContainer);
			}

			const option: any = {
				backgroundColor: 'transparent',
				title: title
					? {
							text: title,
							left: 'left',
							textStyle: { fontSize: 14, fontWeight: 600, color: '#111827' }
						}
					: undefined,
				tooltip: {
					trigger: 'axis',
					backgroundColor: '#fff',
					borderColor: '#e5e7eb',
					borderWidth: 1,
					textStyle: { color: '#374151', fontSize: 12 },
					formatter: (params: any[]) => {
						if (!params.length) return '';
						const dateStr = params[0].axisValueLabel;
						let html = `<div style="font-weight:600;margin-bottom:4px">${dateStr}</div>`;
						for (const p of params) {
							if (p.value == null || p.value[1] == null) continue;
							html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">`;
							html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
							html += `<span>${p.seriesName}</span>`;
							html += `<span style="margin-left:auto;font-weight:600">${formatYValue(p.value[1])}</span>`;
							html += `</div>`;
						}
						return html;
					}
				},
				legend: {
					bottom: 0,
					itemWidth: 12,
					itemHeight: 8,
					textStyle: { fontSize: 11, color: '#6b7280' }
				},
				grid: {
					left: 12,
					right: 16,
					top: title ? 36 : 12,
					bottom: 36,
					containLabel: true
				},
				xAxis: {
					type: 'time',
					axisLine: { lineStyle: { color: '#e5e7eb' } },
					axisTick: { show: false },
					axisLabel: {
						color: '#9ca3af',
						fontSize: 11,
						formatter: (value: number) => {
							const d = new Date(value);
							const month = d.getMonth();
							// Show Q1/Q2/Q3/Q4 YYYY or just YYYY for Jan
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
						color: '#9ca3af',
						fontSize: 11,
						formatter: (value: number) => formatYValue(value)
					},
					splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
				},
				series: currentSeries.map((s) => ({
					name: s.label,
					type: 'line',
					symbol: 'none',
					smooth: false,
					lineStyle: { width: 2, color: s.color },
					itemStyle: { color: s.color },
					data: s.data
						.filter((d) => d.value !== null)
						.map((d) => [parseDate(d.date), d.value])
				}))
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

<div bind:this={chartContainer} style="width:100%;height:{height}"></div>
