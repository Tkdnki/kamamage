-- ============================================================
-- KamaMage — Schéma complet (à exécuter dans l'éditeur SQL Supabase)
-- ============================================================

-- 1. EXTENSION UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES DE PRIX EXISTANTES (inchangées)
-- ============================================================
CREATE TABLE IF NOT EXISTS kama_prices (
  server_name TEXT NOT NULL,
  category    TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  price       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_name, category, item_key)
);

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

CREATE INDEX IF NOT EXISTS idx_kama_prices_server ON kama_prices (server_name);
CREATE INDEX IF NOT EXISTS idx_kama_hdv_prices_server ON kama_hdv_prices (server_name);

-- ============================================================
-- COLLABORATIVE : PROFIL UTILISATEUR
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pseudo      TEXT NOT NULL UNIQUE,
  serveur     TEXT,
  score       INTEGER NOT NULL DEFAULT 0,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Création auto du profil à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, pseudo, serveur)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'pseudo', NEW.email),
    NEW.raw_user_meta_data ->> 'serveur'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- COLLABORATIVE : SOUMISSIONS DE PRIX
-- ============================================================
CREATE TABLE IF NOT EXISTS price_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name   TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('rune', 'hdv')),
  item_key      TEXT NOT NULL,
  lot           TEXT CHECK (lot IN ('x1','x10','x100','x1000')) DEFAULT NULL,
  price         INTEGER NOT NULL CHECK (price >= 0),
  submitted_by  UUID NOT NULL REFERENCES profiles(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','validated','rejected')),
  validated_by  UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at  TIMESTAMPTZ,
  CONSTRAINT unique_submission UNIQUE (server_name, category, item_key, lot, submitted_by)
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON price_submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_item  ON price_submissions (server_name, category, item_key);

-- Auto-validation des soumissions admin (bypass le statut pending)
CREATE OR REPLACE FUNCTION auto_validate_admin_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.submitted_by AND role = 'admin') THEN
    NEW.status := 'validated';
    NEW.validated_by := NEW.submitted_by;
    NEW.validated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_validate_admin ON price_submissions;
CREATE TRIGGER trg_auto_validate_admin
  BEFORE INSERT ON price_submissions
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_admin_submission();

-- Fonction utilitaire pour incrémenter le score d'un profil (utilisée par l'Edge Function)
CREATE OR REPLACE FUNCTION increment_profile_score(profile_id UUID, delta INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles SET score = score + delta WHERE id = profile_id;
END;
$$;

-- ============================================================
-- COLLABORATIVE : PRIX CONSOLIDÉS (affichés publiquement)
-- ============================================================
CREATE TABLE IF NOT EXISTS consolidated_prices (
  server_name   TEXT NOT NULL,
  category      TEXT NOT NULL,
  item_key      TEXT NOT NULL,
  lot           TEXT DEFAULT NULL,
  price         INTEGER NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_name, category, item_key, lot)
);

-- ============================================================
-- VOTES PARTICIPATIFS
-- ============================================================

-- Colonne de suppression douce sur les soumissions
ALTER TABLE price_submissions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS price_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES price_submissions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type     BOOLEAN NOT NULL,  -- true = pouce haut, false = pouce bas
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_vote UNIQUE (submission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_submission ON price_votes (submission_id);

-- RPC : Enregistrer/mettre à jour un vote et gérer la suppression auto
CREATE OR REPLACE FUNCTION handle_vote(p_submission_id UUID, p_vote_type BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_submitter_id UUID;
  v_submitter_role TEXT;
  v_thumbs_down INT;
BEGIN
  -- Vérifier que la soumission existe et n'est pas déjà supprimée
  SELECT submitted_by INTO v_submitter_id
  FROM public.price_submissions
  WHERE id = p_submission_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already deleted';
  END IF;

  -- Upsert du vote
  INSERT INTO public.price_votes (submission_id, user_id, vote_type)
  VALUES (p_submission_id, auth.uid(), p_vote_type)
  ON CONFLICT (submission_id, user_id)
  DO UPDATE SET vote_type = p_vote_type, created_at = now();

  -- Compter les pouces bas
  SELECT count(*) INTO v_thumbs_down
  FROM public.price_votes
  WHERE submission_id = p_submission_id AND vote_type = false;

  -- Si >= 3 pouces bas, vérifier le rôle du soumetteur
  IF v_thumbs_down >= 3 THEN
    SELECT role INTO v_submitter_role
    FROM public.profiles
    WHERE id = v_submitter_id;

    IF v_submitter_role IS DISTINCT FROM 'admin' THEN
      UPDATE public.price_submissions
      SET is_deleted = true
      WHERE id = p_submission_id;
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- --- profiles ---
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_public" ON profiles;
CREATE POLICY "profiles_select_public" ON profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- --- price_submissions ---
ALTER TABLE price_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions_select_public" ON price_submissions;
CREATE POLICY "submissions_select_public" ON price_submissions
  FOR SELECT USING (is_deleted = false);

DROP POLICY IF EXISTS "submissions_insert_auth" ON price_submissions;
CREATE POLICY "submissions_insert_auth" ON price_submissions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = submitted_by);

-- UPDATE / DELETE : interdit pour les users, autorisé pour les admins
DROP POLICY IF EXISTS "submissions_admin_update" ON price_submissions;
CREATE POLICY "submissions_admin_update" ON price_submissions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "submissions_no_delete" ON price_submissions;
CREATE POLICY "submissions_no_delete" ON price_submissions
  FOR DELETE USING (false);

-- --- consolidated_prices ---
ALTER TABLE consolidated_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consolidated_select_public" ON consolidated_prices;
CREATE POLICY "consolidated_select_public" ON consolidated_prices
  FOR SELECT USING (true);

-- Aucune écriture depuis le client (Edge Function seulement, service_role)
DROP POLICY IF EXISTS "consolidated_no_insert" ON consolidated_prices;
CREATE POLICY "consolidated_no_insert" ON consolidated_prices
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "consolidated_no_update" ON consolidated_prices;
CREATE POLICY "consolidated_no_update" ON consolidated_prices
  FOR UPDATE USING (false);

-- --- price_votes ---
ALTER TABLE price_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "votes_select_public" ON price_votes;
CREATE POLICY "votes_select_public" ON price_votes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "votes_insert_own" ON price_votes;
CREATE POLICY "votes_insert_own" ON price_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "votes_update_own" ON price_votes;
CREATE POLICY "votes_update_own" ON price_votes
  FOR UPDATE USING (auth.uid() = user_id);

-- --- kama_prices / kama_hdv_prices existantes ---
-- Lecture publique, écriture via Edge Function seulement
DROP POLICY IF EXISTS "kama_prices_select_public" ON kama_prices;
CREATE POLICY "kama_prices_select_public" ON kama_prices FOR SELECT USING (true);
DROP POLICY IF EXISTS "kama_prices_no_write" ON kama_prices;
CREATE POLICY "kama_prices_no_write" ON kama_prices FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "kama_prices_no_update" ON kama_prices;
CREATE POLICY "kama_prices_no_update" ON kama_prices FOR UPDATE USING (false);

DROP POLICY IF EXISTS "kama_hdv_select_public" ON kama_hdv_prices;
CREATE POLICY "kama_hdv_select_public" ON kama_hdv_prices FOR SELECT USING (true);
DROP POLICY IF EXISTS "kama_hdv_no_write" ON kama_hdv_prices;
CREATE POLICY "kama_hdv_no_write" ON kama_hdv_prices FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "kama_hdv_no_update" ON kama_hdv_prices;
CREATE POLICY "kama_hdv_no_update" ON kama_hdv_prices FOR UPDATE USING (false);
