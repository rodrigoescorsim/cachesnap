-- Link historical alert records to their parent incident for traceability
ALTER TABLE alerts ADD COLUMN incident_id UUID REFERENCES alert_incidents(id) ON DELETE SET NULL;
CREATE INDEX alerts_incident_id_idx ON alerts (incident_id) WHERE incident_id IS NOT NULL;
