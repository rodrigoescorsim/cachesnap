-- Normalizar URLs removendo a barra final para garantir consistência
-- Removemos duplicatas que podem surgir após a normalização (e.g. site.com e site.com/ virarem o mesmo)
DELETE FROM monitors a
USING monitors b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND RTRIM(a.url, '/') = RTRIM(b.url, '/');

-- Atualiza todas as URLs existentes para o formato sem barra final
UPDATE monitors SET url = RTRIM(url, '/') WHERE url LIKE '%/';
