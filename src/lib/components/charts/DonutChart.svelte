<script lang="ts">
	import { formatNumber, formatPercent } from '$lib/utils/formatters.js';
	import { isDark as getIsDark } from '$lib/stores/theme.svelte.js';
	import { echarts } from './echarts-setup.js';
	import { getCSSVar, getChartPalette } from '$lib/utils/chart-colors.js';

	let {
		data,
		height = '240px',
		valueFormatter = formatNumber,
		showPercent = true,
		innerLabel
	}: {
		data: Array<{ label: string; value: number }>;
		height?: string;
		valueFormatter?: (v: number) => string;
		showPercent?: boolean;
		/** Text to show in the center of the donut */
		innerLabel?: string;
	} = $props();

	let chartContainer = $state<HTMLDivElement | null>(null);
	let chart: any;
	let dark = $derived(getIsDark());

	let total = $derived(data.reduce((s, d) => s + d.value, 0));

	$effect(() => {
		const currentData = data;
		const isDark = dark;
		const currentTotal = total;

		if (!currentData.length || !chartContainer) return;

		if (!chart) {
			chart = echarts.init(chartContainer);
		}

		const palette = getChartPalette();
		const surface1 = getCSSVar('--surface-1');
		const border = getCSSVar('--border');
		const textPrimary = getCSSVar('--text-primary');
		const textTertiary = getCSSVar('--text-tertiary');

		const option: any = {
			backgroundColor: 'transparent',
			animation: true,
			animationDuration: 600,
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
					const pct = currentTotal > 0 ? ((params.value / currentTotal) * 100).toFixed(1) : '0';
					return `<div style="font-weight:600;margin-bottom:2px;font-size:12px">${params.name}</div>` +
						`<div style="display:flex;align-items:center;gap:6px;font-size:12px">` +
						`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${params.color}"></span>` +
						`<span>${valueFormatter(params.value)}</span>` +
						`<span style="color:${textTertiary}">(${pct}%)</span>` +
						`</div>`;
				}
			},
			legend: {
				orient: 'vertical',
				right: 4,
				top: 'middle',
				itemWidth: 8,
				itemHeight: 8,
				itemGap: 6,
				textStyle: {
					color: textTertiary,
					fontSize: 11,
					fontFamily: "'Inter', system-ui, sans-serif"
				},
				formatter: (name: string) => {
					if (name.length > 12) return name.slice(0, 12) + '...';
					return name;
				}
			},
			series: [
				{
					type: 'pie',
					radius: ['52%', '78%'],
					center: ['35%', '50%'],
					avoidLabelOverlap: false,
					itemStyle: {
						borderRadius: 3,
						borderColor: surface1,
						borderWidth: 2
					},
					label: innerLabel ? {
						show: true,
						position: 'center',
						formatter: innerLabel,
						fontSize: 13,
						fontWeight: 600,
						fontFamily: "'Inter', system-ui, sans-serif",
						color: textPrimary
					} : {
						show: false
					},
					emphasis: {
						label: {
							show: true,
							fontSize: 13,
							fontWeight: 600,
							fontFamily: "'Inter', system-ui, sans-serif",
							color: textPrimary,
							formatter: (params: any) => {
								const pct = currentTotal > 0 ? ((params.value / currentTotal) * 100).toFixed(0) : '0';
								return `${pct}%`;
							}
						},
						itemStyle: {
							shadowBlur: 8,
							shadowOffsetX: 0,
							shadowColor: 'rgba(0, 0, 0, 0.2)'
						}
					},
					data: currentData.map((d, i) => ({
						name: d.label,
						value: d.value,
						itemStyle: { color: palette[i % palette.length] }
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

{#if data.length > 0}
	<div bind:this={chartContainer} style="width:100%;height:{height}" aria-hidden="true"></div>
	<p class="sr-only">Donut chart showing distribution of {data.length} categories. Total: {valueFormatter(total)}.</p>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		No data
	</div>
{/if}
