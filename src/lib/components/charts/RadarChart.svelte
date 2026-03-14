<script lang="ts">
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';
	import { echarts } from './echarts-setup.js';
	import { getCSSVar } from '$lib/utils/chart-colors.js';

	let {
		indicators,
		data,
		height = '300px'
	}: {
		indicators: Array<{ name: string; max: number }>;
		data: Array<{ name: string; values: number[] }>;
		height?: string;
	} = $props();

	let chartContainer = $state<HTMLDivElement | null>(null);
	let chart: any;
	let dark = $derived(getIsDark());

	$effect(() => {
		const currentIndicators = indicators;
		const currentData = data;
		const isDark = dark;

		if (!currentIndicators.length || !currentData.length || !chartContainer) return;

		if (!chart) {
			chart = echarts.init(chartContainer);
		}

		const chart1 = getCSSVar('--chart-1');
		const surface1 = getCSSVar('--surface-1');
		const surface3 = getCSSVar('--surface-3');
		const border = getCSSVar('--border');
		const textPrimary = getCSSVar('--text-primary');
		const textSecondary = getCSSVar('--text-secondary');
		const textTertiary = getCSSVar('--text-tertiary');

		const option: any = {
			backgroundColor: 'transparent',
			animation: true,
			animationDuration: 500,
			animationEasing: 'cubicOut',
			tooltip: {
				trigger: 'item',
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
				formatter: (params: any) => {
					let html = `<div style="font-weight:600;margin-bottom:4px;font-size:12px">${params.name}</div>`;
					const values = params.value as number[];
					for (let i = 0; i < currentIndicators.length; i++) {
						html += `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:1px">`;
						html += `<span style="color:${textSecondary}">${currentIndicators[i].name}</span>`;
						html += `<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${values[i]}</span>`;
						html += `</div>`;
					}
					return html;
				}
			},
			radar: {
				indicator: currentIndicators,
				shape: 'polygon',
				splitNumber: 4,
				axisName: {
					color: textSecondary,
					fontSize: 11,
					fontFamily: "'Inter', system-ui, sans-serif"
				},
				splitArea: {
					areaStyle: {
						color: isDark
							? ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)']
							: ['rgba(0,0,0,0.01)', 'rgba(0,0,0,0.03)']
					}
				},
				splitLine: {
					lineStyle: {
						color: surface3
					}
				},
				axisLine: {
					lineStyle: {
						color: surface3
					}
				}
			},
			series: [
				{
					type: 'radar',
					data: currentData.map((d) => ({
						name: d.name,
						value: d.values,
						areaStyle: {
							color: chart1,
							opacity: 0.15
						},
						lineStyle: {
							color: chart1,
							width: 2
						},
						itemStyle: {
							color: chart1,
							borderColor: surface1,
							borderWidth: 1
						},
						symbol: 'circle',
						symbolSize: 6
					}))
				}
			]
		};

		chart.setOption(option, true);
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

{#if indicators.length > 0 && data.length > 0}
	<div bind:this={chartContainer} style="width:100%;height:{height}" aria-hidden="true"></div>
	<p class="sr-only">Radar chart showing {indicators.map((i) => i.name).join(', ')} dimensions.</p>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		No data
	</div>
{/if}
