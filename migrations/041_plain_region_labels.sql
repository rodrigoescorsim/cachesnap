-- Revert region labels to plain city names (drop the "- id" suffix added in 040).
UPDATE regions SET label = 'São Paulo'  WHERE id = 'sa-east';
UPDATE regions SET label = 'Frankfurt'  WHERE id = 'eu-west';
UPDATE regions SET label = 'Ohio'       WHERE id = 'us-east';
UPDATE regions SET label = 'Oregon'     WHERE id = 'us-west';
UPDATE regions SET label = 'Tokyo'      WHERE id = 'ap-east';
UPDATE regions SET label = 'Mumbai'     WHERE id = 'ap-south';
UPDATE regions SET label = 'Sydney'     WHERE id = 'oc';
UPDATE regions SET label = 'Cape Town'  WHERE id = 'af-south';
