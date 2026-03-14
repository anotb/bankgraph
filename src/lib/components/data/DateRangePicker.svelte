<script lang="ts">
	type DateRange = { from: string; to: string };

	let {
		value = $bindable<DateRange>({ from: '', to: '' }),
		availableRange,
		onchange
	}: {
		value: DateRange;
		availableRange?: { earliest: string; latest: string };
		onchange?: (range: DateRange) => void;
	} = $props();

	// Quarter end dates: Q1=0331, Q2=0630, Q3=0930, Q4=1231
	const quarterEnds = ['0331', '0630', '0930', '1231'] as const;

	/** Convert YYYYMMDD to "2024Q4" display format */
	function toQuarterLabel(yyyymmdd: string): string {
		const year = yyyymmdd.slice(0, 4);
		const mmdd = yyyymmdd.slice(4);
		const qIdx = quarterEnds.indexOf(mmdd as (typeof quarterEnds)[number]);
		return qIdx >= 0 ? `${year}Q${qIdx + 1}` : `${year}`;
	}

	/** Get quarter-end YYYYMMDD that is <= the given date, stepping back by N quarters */
	function quartersBefore(refDate: string, nQuarters: number): string {
		const year = parseInt(refDate.slice(0, 4), 10);
		const mmdd = refDate.slice(4);
		// Find which quarter the refDate falls in or before
		let qIdx = quarterEnds.findIndex((q) => mmdd <= q);
		if (qIdx === -1) qIdx = 3; // past Dec, treat as Q4

		// Step back nQuarters
		let targetQ = qIdx - nQuarters;
		let targetYear = year;
		while (targetQ < 0) {
			targetQ += 4;
			targetYear -= 1;
		}
		return `${targetYear}${quarterEnds[targetQ % 4]}`;
	}

	const presets = [
		{ label: '4Q', value: '4Q', quarters: 4 },
		{ label: '8Q', value: '8Q', quarters: 8 },
		{ label: '5Y', value: '5Y', quarters: 20 },
		{ label: '10Y', value: '10Y', quarters: 40 },
		{ label: 'All', value: 'All', quarters: 0 }
	] as const;

	let activePreset = $state<string>('10Y');
	let showCustom = $state(false);

	/** Build the list of available quarter labels for the dropdowns */
	let quarterOptions = $derived.by((): string[] => {
		if (!availableRange) return [];
		const { earliest, latest } = availableRange;
		const options: string[] = [];
		let current = latest;
		while (current >= earliest) {
			options.push(current);
			current = quartersBefore(current, 1);
			// Safety: prevent infinite loop
			if (options.length > 200) break;
		}
		return options;
	});

	let customFrom = $state('');
	let customTo = $state('');

	// Initialize custom selectors from current value when switching to custom
	function initCustomFromValue(): void {
		customFrom = value.from || (availableRange?.earliest ?? '');
		customTo = value.to || (availableRange?.latest ?? '');
	}

	function applyPreset(preset: (typeof presets)[number]): void {
		showCustom = false;
		activePreset = preset.value;

		const latest = availableRange?.latest ?? '';
		const earliest = availableRange?.earliest ?? '';

		if (!latest) return;

		let from: string;
		if (preset.value === 'All') {
			from = earliest;
		} else {
			from = quartersBefore(latest, preset.quarters);
			if (from < earliest) from = earliest;
		}

		const range = { from, to: latest };
		value = range;
		onchange?.(range);
	}

	function applyCustom(): void {
		if (!customFrom || !customTo) return;
		const range = { from: customFrom, to: customTo };
		value = range;
		onchange?.(range);
	}

	function activateCustom(): void {
		activePreset = 'Custom';
		showCustom = true;
		initCustomFromValue();
	}

	/** Check if a preset matches the current value */
	function isPresetActive(preset: (typeof presets)[number]): boolean {
		return activePreset === preset.value && !showCustom;
	}
</script>

<div class="flex items-center gap-2 flex-wrap">
	<span class="text-[13px] text-[--text-tertiary]">Period:</span>
	<div class="flex gap-1">
		{#each presets as preset}
			<button
				class="px-2.5 py-1 text-[12px] rounded font-medium transition-colors
					{isPresetActive(preset)
					? 'bg-[--accent] text-white'
					: 'bg-[--surface-2] text-[--text-secondary] hover:bg-[--surface-3]'}"
				onclick={() => applyPreset(preset)}
			>
				{preset.label}
			</button>
		{/each}
		<button
			class="px-2.5 py-1 text-[12px] rounded font-medium transition-colors
				{showCustom
				? 'bg-[--accent] text-white'
				: 'bg-[--surface-2] text-[--text-secondary] hover:bg-[--surface-3]'}"
			onclick={activateCustom}
		>
			Custom
		</button>
	</div>

	{#if showCustom && quarterOptions.length > 0}
		<div class="flex items-center gap-1.5">
			<select
				aria-label="Start quarter"
				class="px-2 py-1 text-[12px] rounded bg-[--surface-2] text-[--text-primary] border border-[--border-muted]
					focus:border-[--accent] focus:outline-none focus:ring-1 focus:ring-[--accent]/30
					data-mono cursor-pointer"
				bind:value={customFrom}
				onchange={applyCustom}
			>
				{#each quarterOptions as q}
					<option value={q} disabled={q > customTo && customTo !== ''}>
						{toQuarterLabel(q)}
					</option>
				{/each}
			</select>
			<span class="text-[11px] text-[--text-disabled]">to</span>
			<select
				aria-label="End quarter"
				class="px-2 py-1 text-[12px] rounded bg-[--surface-2] text-[--text-primary] border border-[--border-muted]
					focus:border-[--accent] focus:outline-none focus:ring-1 focus:ring-[--accent]/30
					data-mono cursor-pointer"
				bind:value={customTo}
				onchange={applyCustom}
			>
				{#each quarterOptions as q}
					<option value={q} disabled={q < customFrom && customFrom !== ''}>
						{toQuarterLabel(q)}
					</option>
				{/each}
			</select>
		</div>
	{/if}
</div>
