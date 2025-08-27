-- documents are raw files or URLs you ingest
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,           -- file path or URL
  title TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- chunks enable fast, targeted retrieval
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  text TEXT NOT NULL
);

-- simple keyword index (pg_trgm or tsvector)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_chunks_trgm ON chunks USING gin (text gin_trgm_ops);

-- memory log for big jobs / session context
CREATE TABLE IF NOT EXISTS memory_log (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_ts TIMESTAMPTZ DEFAULT now(),
  kind TEXT NOT NULL,             -- "ask" | "answer" | "note"
  content TEXT NOT NULL
);
