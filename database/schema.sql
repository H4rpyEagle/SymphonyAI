-- Symphony AI — PostgreSQL schema
-- Local: psql "$DATABASE_URL" -f schema.sql
-- Supabase cloud: SQL Editor → colar este ficheiro → Run
-- Ligação Node: use Session pooler no .env se db.*.supabase.co der ENOTFOUND (IPv6).
-- https://supabase.com/docs/guides/database/connecting-to-postgres

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE quadrante_tarefa AS ENUM ('pendente', 'Q1', 'Q2', 'Q3', 'Q4');

CREATE TYPE status_tarefa AS ENUM ('a_fazer', 'em_progresso', 'concluido');

-- Campos pedidos + is_two_minute (regra dos 2 minutos → etiqueta "Fazer agora" no UI)
CREATE TABLE IF NOT EXISTS tarefas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo           TEXT NOT NULL,
    descricao        TEXT DEFAULT '',
    quadrante        quadrante_tarefa NOT NULL DEFAULT 'pendente',
    e_pareto         BOOLEAN NOT NULL DEFAULT false,
    horario_sugerido TEXT NOT NULL DEFAULT 'Tarde'
        CHECK (horario_sugerido IN ('Manhã', 'Tarde', 'Noite')),
    e_dois_minutos   BOOLEAN NOT NULL DEFAULT false,
    status           status_tarefa NOT NULL DEFAULT 'a_fazer',
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_quadrante ON tarefas (quadrante);
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON tarefas (status);
CREATE INDEX IF NOT EXISTS idx_tarefas_criado_em ON tarefas (criado_em DESC);
