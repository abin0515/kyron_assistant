CREATE TABLE IF NOT EXISTS model_pricing (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_usd_per_million NUMERIC(12, 6) NOT NULL CHECK (input_usd_per_million >= 0),
  cached_input_usd_per_million NUMERIC(12, 6) NOT NULL CHECK (cached_input_usd_per_million >= 0),
  output_usd_per_million NUMERIC(12, 6) NOT NULL CHECK (output_usd_per_million >= 0),
  effective_from TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, model, effective_from)
);
