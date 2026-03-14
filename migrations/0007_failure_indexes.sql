-- Add index on failures.fail_date for ORDER BY fail_date DESC queries
-- Used by homepage (recent failures), industry page, and filtered counts
CREATE INDEX IF NOT EXISTS idx_failures_fail_date ON failures(fail_date DESC);
