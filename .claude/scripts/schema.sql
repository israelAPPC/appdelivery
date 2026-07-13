-- Schema do banco local de conhecimento (rag.db), local ao projeto.
-- Usa node:sqlite (embutido no Node, sem compilação nativa).
-- Similaridade de vetor é calculada em JS (cosine similarity), sem extensão nativa,
-- para evitar dependência de build tools (better-sqlite3/sqlite-vec exigem Visual Studio no Windows).

CREATE TABLE IF NOT EXISTS knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,              -- caminho do arquivo .md de origem em .claude/knowledge/
  content TEXT NOT NULL,           -- chunk de texto (200-300 tokens)
  category TEXT NOT NULL,          -- bug | decisao-arquitetura | padrao | nao-funcionou
  agent TEXT,                      -- agent que gerou o aprendizado (ex: backend-payments)
  embedding TEXT NOT NULL,         -- embedding serializado como JSON array de floats
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_agent ON knowledge(agent);
