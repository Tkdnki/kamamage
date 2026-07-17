-- Table des prix de runes partagés
CREATE TABLE IF NOT EXISTS kama_prices (
  server_name TEXT NOT NULL,
  category    TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  price       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_name, category, item_key)
);

-- Table des prix HDV partagés
CREATE TABLE IF NOT EXISTS kama_hdv_prices (
  server_name   TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  price_x1      INTEGER NOT NULL DEFAULT 0,
  price_x10     INTEGER NOT NULL DEFAULT 0,
  price_x100    INTEGER NOT NULL DEFAULT 0,
  price_x1000   INTEGER NOT NULL DEFAULT 0,
  unit_average  REAL NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_name, item_id)
);

-- Index pour accélérer les requêtes par serveur
CREATE INDEX IF NOT EXISTS idx_kama_prices_server ON kama_prices (server_name);
CREATE INDEX IF NOT EXISTS idx_kama_hdv_prices_server ON kama_hdv_prices (server_name);
