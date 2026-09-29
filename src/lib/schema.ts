// Relational schema for Clarity. Kept as plain SQL so it is easy to read and audit.
// Every discovery record carries product_id; relationships live in `links` and are
// validated against product boundaries by src/lib/links.ts.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lifecycle TEXT NOT NULL DEFAULT 'exploring',
  target_users TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  prioritization TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS initiatives (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  title TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  refined_question TEXT NOT NULL DEFAULT '',
  refined_status TEXT NOT NULL DEFAULT 'none',
  affected TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '',
  decision_to_inform TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  constraints TEXT NOT NULL DEFAULT '',
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  process_enabled INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  started_mode TEXT NOT NULL DEFAULT 'question',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_initiatives_product ON initiatives(product_id);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'other',
  source_date TEXT,
  participant TEXT NOT NULL DEFAULT '',
  segment TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  content TEXT NOT NULL,
  content_kind TEXT NOT NULL DEFAULT 'text',
  version INTEGER NOT NULL DEFAULT 1,
  synthetic INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  filename TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_sources_product ON sources(product_id);

CREATE TABLE IF NOT EXISTS source_versions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  change_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(source_id, version)
);

CREATE TABLE IF NOT EXISTS initiative_sources (
  initiative_id TEXT NOT NULL REFERENCES initiatives(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  added_at TEXT NOT NULL,
  PRIMARY KEY (initiative_id, source_id)
);

CREATE TABLE IF NOT EXISTS excerpts (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_version INTEGER NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  text TEXT NOT NULL,
  row_ref TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_excerpts_source ON excerpts(source_id);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  excerpt_id TEXT REFERENCES excerpts(id),
  initiative_id TEXT REFERENCES initiatives(id),
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  statement TEXT NOT NULL,
  interpretation TEXT NOT NULL DEFAULT '',
  limitations TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT '',
  segment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'accepted',
  needs_review INTEGER NOT NULL DEFAULT 0,
  review_reason TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'manual',
  finding_date TEXT,
  superseded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  title TEXT NOT NULL,
  problem TEXT NOT NULL DEFAULT '',
  segment TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  desired_outcome TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT '',
  unknowns TEXT NOT NULL DEFAULT '',
  scores TEXT NOT NULL DEFAULT '{}',
  override_score REAL,
  override_rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  origin TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS solution_concepts (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  intervention_type TEXT NOT NULL DEFAULT 'product_feature',
  tradeoffs TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'considering',
  origin TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS assumptions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  statement TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'none',
  importance TEXT NOT NULL DEFAULT 'unknown',
  support TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'untested',
  origin TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  statement TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'interview',
  target TEXT NOT NULL DEFAULT '',
  success_criterion TEXT NOT NULL DEFAULT '',
  criterion_locked_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  results TEXT NOT NULL DEFAULT '',
  interpretation TEXT NOT NULL DEFAULT '',
  limitations TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  outcome TEXT,
  origin TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  decision_type TEXT NOT NULL DEFAULT 'investigate',
  statement TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  alternatives TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  expected_outcome TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  decided_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  needs_review INTEGER NOT NULL DEFAULT 0,
  review_reason TEXT NOT NULL DEFAULT '',
  evidence_snapshot TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(from_type, from_id, to_type, to_id, relation)
);
CREATE INDEX IF NOT EXISTS ix_links_from ON links(from_type, from_id);
CREATE INDEX IF NOT EXISTS ix_links_to ON links(to_type, to_id);

CREATE TABLE IF NOT EXISTS process_maps (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'current',
  description TEXT NOT NULL DEFAULT '',
  baseline_map_id TEXT REFERENCES process_maps(id),
  baseline_snapshot TEXT,
  scenario TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS process_nodes (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES process_maps(id),
  stable_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'activity',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  system TEXT NOT NULL DEFAULT '',
  inputs TEXT NOT NULL DEFAULT '',
  outputs TEXT NOT NULL DEFAULT '',
  timing TEXT NOT NULL DEFAULT '',
  pain_points TEXT NOT NULL DEFAULT '',
  controls TEXT NOT NULL DEFAULT '',
  provenance TEXT NOT NULL DEFAULT 'manual',
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  UNIQUE(map_id, stable_id)
);

CREATE TABLE IF NOT EXISTS process_edges (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES process_maps(id),
  source_stable_id TEXT NOT NULL,
  target_stable_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS process_changes (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES process_maps(id),
  stable_id TEXT NOT NULL,
  what TEXT NOT NULL DEFAULT '',
  why TEXT NOT NULL DEFAULT '',
  addresses TEXT NOT NULL DEFAULT '',
  expected_outcome TEXT NOT NULL DEFAULT '',
  dependencies TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  assumptions TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(map_id, stable_id)
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'selected',
  config TEXT NOT NULL DEFAULT '{}',
  data TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  interpretation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  parent_analysis_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_analyses_product ON analyses(product_id);

CREATE TABLE IF NOT EXISTS analysis_sources (
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  added_at TEXT NOT NULL,
  PRIMARY KEY (analysis_id, source_id)
);

CREATE TABLE IF NOT EXISTS analysis_revisions (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  seq INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(analysis_id, seq)
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  seq INTEGER NOT NULL,
  mode TEXT NOT NULL,
  inputs TEXT NOT NULL,
  results TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(analysis_id, seq)
);

CREATE TABLE IF NOT EXISTS event_datasets (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_version INTEGER NOT NULL,
  analysis_id TEXT REFERENCES analyses(id),
  name TEXT NOT NULL,
  mapping TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '{}',
  validation TEXT NOT NULL DEFAULT '{}',
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_proposals (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT REFERENCES initiatives(id),
  analysis_id TEXT REFERENCES analyses(id),
  run_id TEXT REFERENCES analysis_runs(id),
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '{}',
  payload TEXT NOT NULL,
  rejected TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_items TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS brief_sections (
  initiative_id TEXT NOT NULL REFERENCES initiatives(id),
  key TEXT NOT NULL,
  narrative TEXT NOT NULL DEFAULT '',
  reviewed_hash TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (initiative_id, key)
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  initiative_id TEXT,
  analysis_id TEXT,
  kind TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_activity_product ON activity(product_id, created_at);
`;
