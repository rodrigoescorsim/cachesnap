-- Prevenir duplicatas de URL para o mesmo usuário
-- Primeiro removemos duplicatas existentes (mantendo o mais recente)
DELETE FROM monitors a
USING monitors b
WHERE a.created_at < b.created_at
  AND a.user_id = b.user_id
  AND a.url = b.url;

-- Adiciona a restrição de unicidade
ALTER TABLE monitors ADD CONSTRAINT unique_user_monitor_url UNIQUE (user_id, url);
