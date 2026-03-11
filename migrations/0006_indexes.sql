CREATE INDEX IF NOT EXISTS idx_inst_active_state_assets ON institutions(active, state, total_assets DESC);
