import { describe, expect, it } from 'vitest';
import {
	correlationInterpretationLabel,
	correlationInterpretationTier,
	MIN_CALCULABLE_CORRELATION_OBSERVATIONS,
	ORDINARY_DESCRIPTIVE_CORRELATION_OBSERVATIONS
} from './correlation-policy';

describe('correlation display policy', () => {
	it('keeps the mathematical minimum usable and tiers its interpretation', () => {
		expect(MIN_CALCULABLE_CORRELATION_OBSERVATIONS).toBe(2);
		expect(ORDINARY_DESCRIPTIVE_CORRELATION_OBSERVATIONS).toBe(12);
		expect(correlationInterpretationTier(1)).toBe('insufficient');
		expect(correlationInterpretationTier(2)).toBe('mechanical_only');
		expect(correlationInterpretationTier(11)).toBe('small_sample_exploratory');
		expect(correlationInterpretationTier(12)).toBe('ordinary_descriptive');
		expect(correlationInterpretationLabel(7)).toBe('Small sample · exploratory');
	});
});
