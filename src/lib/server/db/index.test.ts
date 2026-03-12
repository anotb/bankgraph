import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDB, queryOne, queryAll, execute, batchInsert } from './index';

// Mock D1 prepared statement chain
function createMockStatement(returnValue: unknown = {}) {
	const stmt: any = {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(returnValue),
		all: vi.fn().mockResolvedValue({ results: returnValue }),
		run: vi.fn().mockResolvedValue({ success: true })
	};
	return stmt;
}

function createMockDB(stmtReturnValue?: unknown) {
	const stmt = createMockStatement(stmtReturnValue);
	const db: any = {
		prepare: vi.fn().mockReturnValue(stmt),
		batch: vi.fn().mockResolvedValue([]),
		_stmt: stmt
	};
	return db;
}

describe('getDB', () => {
	it('throws when platform is undefined', () => {
		expect(() => getDB(undefined)).toThrow('D1 database binding not available');
	});

	it('throws when platform.env is undefined', () => {
		expect(() => getDB({} as any)).toThrow('D1 database binding not available');
	});

	it('throws when platform.env.DB is undefined', () => {
		expect(() => getDB({ env: {} } as any)).toThrow('D1 database binding not available');
	});

	it('returns the DB binding when available', () => {
		const mockDB = {};
		const platform = { env: { DB: mockDB } } as any;
		expect(getDB(platform)).toBe(mockDB);
	});
});

describe('queryOne', () => {
	it('calls prepare, bind, and first with correct args', async () => {
		const db = createMockDB({ id: 1, name: 'Test Bank' });
		const result = await queryOne(db, 'SELECT * FROM banks WHERE id = ?', [1]);

		expect(db.prepare).toHaveBeenCalledWith('SELECT * FROM banks WHERE id = ?');
		expect(db._stmt.bind).toHaveBeenCalledWith(1);
		expect(result).toEqual({ id: 1, name: 'Test Bank' });
	});

	it('returns null when no row found', async () => {
		const db = createMockDB();
		db._stmt.first.mockResolvedValue(null);

		const result = await queryOne(db, 'SELECT * FROM banks WHERE id = ?', [999]);
		expect(result).toBeNull();
	});

	it('uses empty params by default', async () => {
		const db = createMockDB();
		await queryOne(db, 'SELECT count(*) FROM banks');
		expect(db._stmt.bind).toHaveBeenCalledWith();
	});
});

describe('queryAll', () => {
	it('returns results array', async () => {
		const rows = [{ id: 1 }, { id: 2 }];
		const db = createMockDB();
		db._stmt.all.mockResolvedValue({ results: rows });

		const result = await queryAll(db, 'SELECT * FROM banks');
		expect(result).toEqual(rows);
	});

	it('returns empty array when results is null', async () => {
		const db = createMockDB();
		db._stmt.all.mockResolvedValue({ results: null });

		const result = await queryAll(db, 'SELECT * FROM banks');
		expect(result).toEqual([]);
	});
});

describe('execute', () => {
	it('calls prepare, bind, and run', async () => {
		const db = createMockDB();
		await execute(db, 'DELETE FROM banks WHERE id = ?', [1]);

		expect(db.prepare).toHaveBeenCalledWith('DELETE FROM banks WHERE id = ?');
		expect(db._stmt.bind).toHaveBeenCalledWith(1);
		expect(db._stmt.run).toHaveBeenCalled();
	});
});

describe('batchInsert', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does nothing for empty rows', async () => {
		const db = createMockDB();
		await batchInsert(db, 'banks', []);
		expect(db.prepare).not.toHaveBeenCalled();
		expect(db.batch).not.toHaveBeenCalled();
	});

	it('generates INSERT OR REPLACE when no primaryKeys', async () => {
		const db = createMockDB();
		const rows = [{ id: 1, name: 'Bank A' }];

		await batchInsert(db, 'banks', rows);

		expect(db.prepare).toHaveBeenCalledWith(
			'INSERT OR REPLACE INTO banks (id, name) VALUES (?, ?)'
		);
		expect(db._stmt.bind).toHaveBeenCalledWith(1, 'Bank A');
		expect(db.batch).toHaveBeenCalledTimes(1);
	});

	it('generates ON CONFLICT upsert when primaryKeys are provided', async () => {
		const db = createMockDB();
		const rows = [{ cert: 123, name: 'Bank A', state: 'CA' }];

		await batchInsert(db, 'banks', rows, ['cert']);

		expect(db.prepare).toHaveBeenCalledWith(
			'INSERT INTO banks (cert, name, state) VALUES (?, ?, ?) ON CONFLICT(cert) DO UPDATE SET name=excluded.name, state=excluded.state'
		);
	});

	it('generates ON CONFLICT with composite primary keys', async () => {
		const db = createMockDB();
		const rows = [{ cert: 123, repdte: '20240331', asset: 1000 }];

		await batchInsert(db, 'financials', rows, ['cert', 'repdte']);

		expect(db.prepare).toHaveBeenCalledWith(
			'INSERT INTO financials (cert, repdte, asset) VALUES (?, ?, ?) ON CONFLICT(cert, repdte) DO UPDATE SET asset=excluded.asset'
		);
	});

	it('handles null values in rows', async () => {
		const db = createMockDB();
		const rows = [{ id: 1, name: null }];

		await batchInsert(db, 'banks', rows);

		expect(db._stmt.bind).toHaveBeenCalledWith(1, null);
	});

	it('handles undefined values in rows (maps to null)', async () => {
		const db = createMockDB();
		const rows = [{ id: 1, name: undefined }];

		await batchInsert(db, 'banks', rows);

		expect(db._stmt.bind).toHaveBeenCalledWith(1, null);
	});

	it('chunks into batches of 50', async () => {
		const db = createMockDB();
		// Create 120 rows -> should result in 3 batch calls (50 + 50 + 20)
		const rows = Array.from({ length: 120 }, (_, i) => ({ id: i, name: `Bank ${i}` }));

		await batchInsert(db, 'banks', rows);

		expect(db.batch).toHaveBeenCalledTimes(3);
		// First batch: 50 statements
		expect(db.batch.mock.calls[0][0]).toHaveLength(50);
		// Second batch: 50 statements
		expect(db.batch.mock.calls[1][0]).toHaveLength(50);
		// Third batch: 20 statements
		expect(db.batch.mock.calls[2][0]).toHaveLength(20);
	});
});
