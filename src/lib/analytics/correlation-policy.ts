/** Pearson's r is calculable from two nonconstant paired observations. */
export const MIN_CALCULABLE_CORRELATION_OBSERVATIONS = 2;

/** Twelve pairs mark an ordinary descriptive reading, not a usability gate. */
export const ORDINARY_DESCRIPTIVE_CORRELATION_OBSERVATIONS = 12;

export type CorrelationInterpretationTier =
	| 'insufficient'
	| 'mechanical_only'
	| 'small_sample_exploratory'
	| 'ordinary_descriptive';

export function correlationInterpretationTier(
	observations: number
): CorrelationInterpretationTier {
	if (observations < MIN_CALCULABLE_CORRELATION_OBSERVATIONS) return 'insufficient';
	if (observations === MIN_CALCULABLE_CORRELATION_OBSERVATIONS) return 'mechanical_only';
	if (observations < ORDINARY_DESCRIPTIVE_CORRELATION_OBSERVATIONS) {
		return 'small_sample_exploratory';
	}
	return 'ordinary_descriptive';
}

export function correlationInterpretationLabel(observations: number): string {
	return ({
		insufficient: 'Insufficient pairs',
		mechanical_only: 'Mechanical only',
		small_sample_exploratory: 'Small sample · exploratory',
		ordinary_descriptive: 'Descriptive'
	} as const)[correlationInterpretationTier(observations)];
}
