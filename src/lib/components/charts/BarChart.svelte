<script lang="ts">
	import { formatNumber } from '$lib/utils/formatters.js';
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';
	import { echarts } from './echarts-setup.js';
	import { getCSSVar } from '$lib/utils/chart-colors.js';

	let {
		data,
		height = '200px',
		color,
		tooltipLabel = 'Value',
		valueFormatter = formatNumber
	}: {
		data: Array<{ label: string; value: number }>;
		height?: string;
		color?: string;
		tooltipLabel?: string;
		valueFormatter?: (v: number) => string;
	} = $props();

	let chartContainer = $state<HTMLDivElement | null>(null);
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
			const accentColor = barColor || getCSSVar('--accent');
			const accentHover = getCSSVar('--accent-hover');
			const surface1 = getCSSVar('--surface-1');
			const border = getCSSVar('--border');
			const textPrimary = getCSSVar('--text-primary');
			const textSecondary = getCSSVar('--text-secondary');
			const textTertiary = getCSSVar('--text-tertiary');
			const borderMuted = getCSSVar('--border-muted');

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
						const p = params[0];
						let html = `<div style="font-weight:600;margin-bottom:2px;font-size:12px">${p.name}</div>`;
						html += `<div style="display:flex;align-items:center;gap:6px;font-size:12px">`;
						html += `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color}"></span>`;
						html += `<span style="color:${textSecondary}">${tooltipLabel}</span>`;
						html += `<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${valueFormatter(p.value)}</span>`;
						html += `</div>`;
						return html;
					}
				},
				grid: {
					left: 4,
					right: 4,
					top: 8,
					bottom: 4,
					containLabel: true
				},
				xAxis: {
					type: 'category',
					data: currentData.map((d) => d.label),
					axisLine: { lineStyle: { color: border } },
					axisTick: { show: false },
					axisLabel: {
						color: textTertiary,
						fontSize: 9,
						fontFamily: "'Inter', system-ui, sans-serif",
						interval: (index: number) => {
							// Show every label if few items, otherwise thin out
							if (currentData.length <= 20) return true;
							// Show labels at ~5 year intervals for larger sets
							const label = currentData[index]?.label;
							if (!label) return false;
							const year = parseInt(label);
							return year % 5 === 0;
						},
						rotate: currentData.length > 30 ? 45 : 0
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
						fontFamily: "'Inter', system-ui, sans-serif"
					},
					splitLine: { lineStyle: { color: borderMuted, type: 'dashed' } }
				},
				series: [
					{
						type: 'bar',
						data: currentData.map((d) => d.value),
						barMaxWidth: 16,
						itemStyle: {
							color: accentColor,
							borderRadius: [2, 2, 0, 0]
						},
						emphasis: {
							itemStyle: {
								color: accentHover
							}
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
	<p class="sr-only">Bar chart showing {data.length} data points. Use the data table for exact values.</p>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		No data
	</div>
{/if}
