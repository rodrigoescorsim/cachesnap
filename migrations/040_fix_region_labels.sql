-- Fix region display labels to "City - region-id" format.
-- Previous migration used ON CONFLICT DO NOTHING, so labels were never updated
-- if the table was pre-populated with id-only labels.
UPDATE regions SET label = 'São Paulo - sa-east' WHERE id = 'sa-east';
UPDATE regions SET label = 'Frankfurt - eu-west' WHERE id = 'eu-west';
UPDATE regions SET label = 'Ohio - us-east'      WHERE id = 'us-east';
UPDATE regions SET label = 'Oregon - us-west'    WHERE id = 'us-west';
UPDATE regions SET label = 'Tokyo - ap-east'     WHERE id = 'ap-east';
UPDATE regions SET label = 'Mumbai - ap-south'   WHERE id = 'ap-south';
UPDATE regions SET label = 'Sydney - oc'         WHERE id = 'oc';
UPDATE regions SET label = 'Cape Town - af-south' WHERE id = 'af-south';
