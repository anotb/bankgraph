import { describe, expect, it } from 'vitest';
import { nextMapState, type MapStatePoint } from './state-map-navigation';

const states: MapStatePoint[] = [
	{ state: 'CA', x: 0, y: 50 },
	{ state: 'TX', x: 45, y: 72 },
	{ state: 'IL', x: 68, y: 42 },
	{ state: 'NY', x: 100, y: 28 },
	{ state: 'FL', x: 82, y: 100 }
];

describe('state map keyboard navigation', () => {
	it('moves to the nearest state in the requested visual direction', () => {
		expect(nextMapState(states, 'IL', 'ArrowLeft')).toBe('TX');
		expect(nextMapState(states, 'IL', 'ArrowRight')).toBe('NY');
		expect(nextMapState(states, 'IL', 'ArrowDown')).toBe('TX');
		expect(nextMapState(states, 'TX', 'ArrowDown')).toBe('FL');
	});

	it('keeps focus stable at the edge of the map', () => {
		expect(nextMapState(states, 'CA', 'ArrowLeft')).toBe('CA');
		expect(nextMapState(states, 'FL', 'ArrowDown')).toBe('FL');
		expect(nextMapState(states, 'XX', 'ArrowRight')).toBe('XX');
	});
});
