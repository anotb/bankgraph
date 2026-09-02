import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATES } from './templates';

const roleColumns: Record<string, number> = {
	lead: 8, support: 4, contrast: 6, reference: 4, multiples: 12, context: 12, investigation: 12
};

describe('curated board templates', () => {
	it('gives every question-led layout a complete starting context', () => {
		for (const id of ['credit_stress', 'funding', 'geography', 'failure_analogues']) {
			const template = BOARD_TEMPLATES.find((item) => item.id === id)!;
			expect(template.start?.question).toBeTruthy();
			expect(template.start?.clearBanks).toBe(true);
			const needsSelectedBanks = template.strips.flatMap((strip) => strip.views).some((view) => view.kind === 'history' || view.kind === 'exact_table');
			if (needsSelectedBanks) expect(template.start?.selection).toBeTruthy();
		}
	});

	it('fills each curated row without accidental blank columns', () => {
		for (const template of BOARD_TEMPLATES) {
			for (const strip of template.strips) {
				const columns = strip.views.reduce((sum, view) => sum + (typeof view.options?.columns === 'number' ? view.options.columns : roleColumns[view.role]), 0);
				expect(columns, `${template.id}: ${strip.title}`).toBe(12);
			}
		}
	});
});
