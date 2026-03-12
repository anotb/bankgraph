<script lang="ts">
	import { formatNumber } from '$lib/utils/formatters.js';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let {
		data,
		height = '200px',
		color
	}: {
		data: Array<{ label: string; value: number }>;
		height?: string;
		color?: string;
	} = $props();

	let chartContainer: HTMLDivElement;
	let chart: any;

	let mode = $derived(getMode());

	$effect(() => {
		const currentData = data;
		const currentMode = mode;
		const barColor = color;
		let disposed = false;

		if (!currentData.length) return;

		import('echarts').then((echarts) => {
			if (disposed || !chartContainer) return;

			if (!chart) {
				chart = echarts.init(chartContainer);
			}

			const isDark = currentMode === 'power';
			const accentColor = barColor || (isDark ? '#2db5a8' : '#0d7d7d');
			const accentHover = isDark ? '#3fc8ba' : '#096a6b';

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
						html += `<span style="color:${isDark ? '#a8a39c' : '#6b6660'}">Failures</span>`;
						html += `<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${formatNumber(p.value)}</span>`;
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
					axisLine: { lineStyle: { color: isDark ? '#383c44' : '#d6d2cb' } },
					axisTick: { show: false },
					axisLabel: {
						color: isDark ? '#7a7e86' : '#948f88',
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
						color: isDark ? '#7a7e86' : '#948f88',
						fontSize: 10,
						fontFamily: "'Inter', system-ui, sans-serif"
					},
					splitLine: { lineStyle: { color: isDark ? '#282c33' : '#e8e5df', type: 'dashed' } }
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
		});

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
	<div bind:this={chartContainer} style="width:100%;height:{height}"></div>
{:else}
	<div
		class="flex items-center justify-center text-[13px] text-[--text-tertiary]"
		style="width:100%;height:{height}"
	>
		No data
	</div>
{/if}
