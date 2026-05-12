-- Removido: nunca foi usado pelo trend detector; repetição de notificações segue severidade/cooldown do worker.
ALTER TABLE monitors DROP COLUMN IF EXISTS alert_trend_cooldown_minutes;
