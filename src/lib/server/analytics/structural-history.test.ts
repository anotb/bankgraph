import { describe, expect, it } from 'vitest';
import { classifyStructuralEvent, normalizeHistoryDate, structuralEventsForWindow } from './structural-history';

describe('structural history', () => {
  it('normalizes the date formats retained from BankFind', () => {
    expect(normalizeHistoryDate('2026-04-01')).toBe('20260401');
    expect(normalizeHistoryDate('04/01/2026')).toBe('20260401');
    expect(normalizeHistoryDate('20260401')).toBe('20260401');
  });

  it('classifies only events that can change the institution perimeter or charter', () => {
    expect(classifyStructuralEvent('Merged into another institution')).toBe('merger');
    expect(classifyStructuralEvent('Acquisition of deposits')).toBe('acquisition');
    expect(classifyStructuralEvent('Charter conversion')).toBe('charter');
    expect(classifyStructuralEvent('Bank closed')).toBe('closure');
    expect(classifyStructuralEvent('Branch Closing')).toBeNull();
    expect(classifyStructuralEvent('Closed', 'BR')).toBeNull();
    expect(classifyStructuralEvent('Address changed')).toBeNull();
  });

  it('does not present routine branch closures as institution-perimeter changes', () => {
    const events = structuralEventsForWindow([{
      id: 'branch-closing',
      event_date: '20260510',
      change_code: 721,
      change_desc: 'Branch Closing',
      org_role: 'BR',
      inst_name: 'Example Bank',
      source_retrieved_at: null
    }], '20260331', '20260630');
    expect(events).toEqual([]);
  });

  it('flags structural events inside the open-closed quarter window', () => {
    const events = structuralEventsForWindow([
      { id: 'before', event_date: '20260331', change_code: 1, change_desc: 'Merger', org_role: null, inst_name: null, source_retrieved_at: null },
      { id: 'inside', event_date: '20260510', change_code: 2, change_desc: 'Charter conversion', org_role: null, inst_name: null, source_retrieved_at: null },
      { id: 'after', event_date: '20260701', change_code: 3, change_desc: 'Closed', org_role: null, inst_name: null, source_retrieved_at: null }
    ], '20260331', '20260630');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'inside', category: 'charter', date: '20260510' });
  });
});
