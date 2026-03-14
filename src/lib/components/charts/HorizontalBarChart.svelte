<script lang="ts">
	import { formatNumber } from '$lib/utils/formatters.js';
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';
	import { echarts } from './echarts-setup.js';

	let {
		data,
		height = '200px',
		color,
		valueFormatter = formatNumber
	}: {
		data: Array<{ label: string; value: number }>;
		height?: string;
		color?: string;
		valueFormatter?: (v: number) => string;
	} = $props();

	let chartContainer: HTMLDivElement;
	let chart: any;

	let dark = $derived(getIsDark());

	$effect(() => {
		const currentData = data;
		const isDark = dark;
		const barColor = color;
		let disposed = false;

		if (!currentData.length) return;

		if (!chartContainer) return;

		{
			if (!chart) {
				chart = echarts.init(chartContainer);
			}

			const accentColor = barColor || (isDark ? '#2db5a8' : '#0d7d7d');
			const accentHover = isDark ? '#3fc8ba' : '#096a6b';

			// Reverse for horizontal bars (ECharts renders bottom-to-top)
			const reversed = [...currentData].reverse();

			const option: any = {
				backgroundColor: 'transparent',
				animation: true,
				animationDuration: 400,
				animationEasing: 'cubicOut',
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
						type: 'shadow',
						shadowStyle: {
							color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
						}
					},
					formatter: (params: any[]) => {
						if (!params.length) return '';
						const p = params[0];
						let html = `<div style="font-weight:600;margin-bottom:2px;font-size:12px">${p.name}</div>`;
						html += `<div style="display:flex;align-items:center;gap:6px;font-size:12px">`;
						html += `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color}"></span>`;
						html += `<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${valueFormatter(p.value)}</span>`;
						html += `</div>`;
						return html;
					}
				},
				grid: {
					left: 4,
					right: 36,
					top: 4,
					bottom: 4,
					containLabel: true
				},
				xAxis: {
					type: 'value',
					axisLine: { show: false },
					axisTick: { show: false },
					axisLabel: { show: false },
					splitLine: { show: false }
				},
				yAxis: {
					type: 'category',
					data: reversed.map((d) => d.label),
					axisLine: { show: false },
					axisTick: { show: false },
					axisLabel: {
						color: isDark ? '#a8a39c' : '#6b6660',
						fontSize: 11,
						fontFamily: "'Inter', system-ui, sans-serif",
						width: 70,
						overflow: 'truncate'
					}
				},
				series: [
					{
						type: 'bar',
						data: reversed.map((d) => d.value),
						barMaxWidth: 14,
						barMinWidth: 6,
						itemStyle: {
							color: accentColor,
							borderRadius: [0, 2, 2, 0]
						},
						emphasis: {
							itemStyle: {
								color: accentHover
							}
						},
						label: {
							show: true,
							position: 'right',
							color: isDark ? '#7a7e86' : '#948f88',
							fontSize: 10,
							fontFamily: "'Inter', system-ui, sans-serif",
							formatter: (params: any) => valueFormatter(params.value)
						}
					}
				]
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

{#if data.length > 0}
	<div bind:this={chartContainer} style="width:100%;height:{height}" aria-hidden="true"></div>
	<p class="sr-only">Horizontal bar chart showing {data.length} items. Use the data table for exact values.</p>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		No data
	</div>
{/if}
