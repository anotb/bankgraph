import { describe, expect, it } from 'vitest';
import { parsePipelineStage, PipelineStageError } from './stages';

describe('parsePipelineStage', () => {
	it('requires one explicit bounded stage', () => {
		expect(() => parsePipelineStage(null)).toThrowError(new PipelineStageError('stage is required'));
	});

	it('accepts the explicit publication step', () => {
		expect(parsePipelineStage('publish')).toBe('publish');
		expect(parsePipelineStage('industry-history')).toBe('industry-history');
	});

	it('accepts the bounded direct-agency macro step and rejects the retired provider step', () => {
		expect(parsePipelineStage('macro')).toBe('macro');
		expect(parsePipelineStage('coverage-audit')).toBe('coverage-audit');
		expect(() => parsePipelineStage('fred')).toThrow('Unknown stage: fred');
	});

	it('rejects unknown stage names', () => {
		expect(() => parsePipelineStage('all')).toThrow('Unknown stage: all');
	});
});
