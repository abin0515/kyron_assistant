-- Standard-tier short-context prices from OpenAI's pricing page, checked
-- October 30, 2026. The admin can add newer rows on the Logs page.
INSERT INTO model_pricing (
  id,
  provider,
  model,
  input_usd_per_million,
  cached_input_usd_per_million,
  output_usd_per_million,
  effective_from,
  note
)
VALUES
  (
    '6f1c0d7e-3c55-4a8e-9b1e-1a0c6d4f2a01',
    'openai',
    'gpt-6-luna',
    0.10,
    0.01,
    0.50,
    '2026-10-30T00:00:00Z',
    'OpenAI pricing page, Standard tier, short context (≤272K input tokens).'
  ),
  (
    '6f1c0d7e-3c55-4a8e-9b1e-1a0c6d4f2a02',
    'openai',
    'gpt-4o-transcribe',
    2.50,
    2.50,
    10.00,
    '2026-10-30T00:00:00Z',
    'OpenAI pricing page, transcription models; no cached rate listed.'
  )
ON CONFLICT (provider, model, effective_from) DO NOTHING;
