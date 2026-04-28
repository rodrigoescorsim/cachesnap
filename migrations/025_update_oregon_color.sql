-- Update Oregon region color to Coral (#f97316)
-- This avoids the clash with the Global Cyan color.
UPDATE regions SET color = '#f97316' WHERE id = 'us-west';
