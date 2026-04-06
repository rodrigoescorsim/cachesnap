-- Migration: 003_add_estimated_gain_to_alerts.sql
-- Adiciona coluna para registrar o ganho estimado calculado pelo motor de diagnóstico

ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS estimated_gain_ms FLOAT;
