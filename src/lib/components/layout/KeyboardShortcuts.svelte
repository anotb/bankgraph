<script lang="ts">
	import { goto } from '$app/navigation';
	import { getMode } from '$lib/stores/mode.svelte.js';

	let showHelp = $state(false);
	let pendingChord = $state<string | null>(null);
	let chordTimer: ReturnType<typeof setTimeout> | undefined;

	function clearChord() {
		pendingChord = null;
		clearTimeout(chordTimer);
	}

	function isInputFocused(): boolean {
		const el = document.activeElement;
		if (!el) return false;
		const tag = el.tagName.toLowerCase();
		return (
			tag === 'input' ||
			tag === 'textarea' ||
			tag === 'select' ||
			(el as HTMLElement).isContentEditable
		);
	}

	function focusSearch() {
		const input = document.querySelector<HTMLInputElement>(
			'input[type="text"][placeholder*="Search"]'
		);
		if (input) {
			input.focus();
			input.select();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (getMode() !== 'power') return;

		// Escape always closes help
		if (e.key === 'Escape' && showHelp) {
			showHelp = false;
			return;
		}

		// Don't intercept when typing in inputs (except for Cmd+K)
		if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			focusSearch();
			clearChord();
			return;
		}

		if (isInputFocused()) return;

		// ? for help
		if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			showHelp = !showHelp;
			clearChord();
			return;
		}

		// / to focus search
		if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			focusSearch();
			clearChord();
			return;
		}

		// Two-key chords: g + <key>
		if (pendingChord === 'g') {
			clearChord();
			const routes: Record<string, string> = {
				b: '/banks',
				i: '/industry',
				m: '/macro',
				c: '/compare',
				g: '/glossary'
			};
			const target = routes[e.key];
			if (target) {
				e.preventDefault();
				goto(target);
			}
			return;
		}

		if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			pendingChord = 'g';
			chordTimer = setTimeout(clearChord, 500);
			return;
		}
	}

	const shortcuts = [
		{
			category: 'Navigation',
			items: [
				{ keys: ['g', 'b'], description: 'Go to Banks' },
				{ keys: ['g', 'i'], description: 'Go to Industry' },
				{ keys: ['g', 'm'], description: 'Go to Macro' },
				{ keys: ['g', 'c'], description: 'Go to Compare' },
				{ keys: ['g', 'g'], description: 'Go to Glossary' }
			]
		},
		{
			category: 'Actions',
			items: [
				{ keys: ['/'], description: 'Focus search' },
				{ keys: ['\u2318', 'K'], description: 'Focus search (from anywhere)' },
				{ keys: ['?'], description: 'Toggle this help' },
				{ keys: ['Esc'], description: 'Close modal' }
			]
		}
	];

	let dialogRef: HTMLDivElement | undefined = $state();
	let previousFocus: HTMLElement | null = null;

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			showHelp = false;
		}
	}

	function trapFocus(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !dialogRef) return;
		const focusable = dialogRef.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (showHelp) {
			previousFocus = document.activeElement as HTMLElement;
			requestAnimationFrame(() => {
				const closeBtn = dialogRef?.querySelector<HTMLElement>('button');
				closeBtn?.focus();
			});
		} else if (previousFocus) {
			previousFocus.focus();
			previousFocus = null;
		}
	});
</script>

<svelte:document onkeydown={handleKeydown} />

{#if showHelp}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
		onclick={handleBackdropClick}
		onkeydown={(e) => { if (e.key === 'Escape') showHelp = false; trapFocus(e); }}
	>
		<div
			class="bg-[--surface-1] rounded-md w-full max-w-[420px] mx-4 overflow-hidden"
			style="box-shadow: var(--shadow-lg)"
			bind:this={dialogRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby="keyboard-shortcuts-title"
		>
			<div class="px-5 py-4 border-b border-[--border-muted] flex items-center justify-between">
				<h2 id="keyboard-shortcuts-title" class="text-[15px] font-semibold text-[--text-primary]">Keyboard Shortcuts</h2>
				<button
					onclick={() => (showHelp = false)}
					class="text-[--text-tertiary] hover:text-[--text-primary] transition-colors"
					aria-label="Close"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<div class="px-5 py-4 space-y-5">
				{#each shortcuts as group}
					<div>
						<h3 class="text-[11px] font-medium text-[--text-tertiary] uppercase tracking-wider mb-2">
							{group.category}
						</h3>
						<div class="space-y-1.5">
							{#each group.items as shortcut}
								<div class="flex items-center justify-between py-1">
									<span class="text-[13px] text-[--text-secondary]">{shortcut.description}</span>
									<div class="flex items-center gap-1">
										{#each shortcut.keys as key}
											<kbd
												class="bg-[--surface-2] text-[--text-secondary] px-1.5 py-0.5 rounded text-[12px] font-mono border border-[--border-muted] min-w-[24px] text-center"
											>
												{key}
											</kbd>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="px-5 py-3 border-t border-[--border-muted] bg-[--surface-2]">
				<p class="text-[11px] text-[--text-tertiary] text-center">
					Shortcuts are only active in Power Mode
				</p>
			</div>
		</div>
	</div>
{/if}
