-- Regions registry: replaces hardcoded REGION_* env vars.
-- Adding a new region = INSERT here + create the Lambda on AWS.

CREATE TABLE IF NOT EXISTS regions (
    id          TEXT        PRIMARY KEY,
    label       TEXT        NOT NULL,
    description TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '#6b7280',
    lambda_url  TEXT        NOT NULL DEFAULT '',
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO regions (id, label, description, color, lambda_url) VALUES
    ('sa-east',  'São Paulo',  'South America — AWS sa-east-1 (São Paulo, BR)',   '#f59e0b', 'https://<function-url-id>.lambda-url.sa-east-1.on.aws/'),
    ('eu-west',  'Frankfurt',  'Europe — AWS eu-central-1 (Frankfurt, DE)',        '#3b82f6', 'https://<function-url-id>.lambda-url.eu-central-1.on.aws/'),
    ('us-east',  'Ohio',       'US East — AWS us-east-2 (Ohio, US)',               '#10b981', 'https://<function-url-id>.lambda-url.us-east-2.on.aws/'),
    ('us-west',  'Oregon',     'US West — AWS us-west-2 (Oregon, US)',             '#06b6d4', 'https://<function-url-id>.lambda-url.us-west-2.on.aws/'),
    ('ap-east',  'Tokyo',      'Asia Pacific — AWS ap-northeast-1 (Tokyo, JP)',    '#8b5cf6', 'https://<function-url-id>.lambda-url.ap-northeast-1.on.aws/'),
    ('ap-south', 'Mumbai',     'India — AWS ap-south-1 (Mumbai, IN)',              '#ec4899', 'https://<function-url-id>.lambda-url.ap-south-1.on.aws/'),
    ('oc',       'Sydney',     'Oceania — AWS ap-southeast-2 (Sydney, AU)',        '#f43f5e', 'https://<function-url-id>.lambda-url.ap-southeast-2.on.aws/'),
    ('af-south', 'Cape Town',  'Africa — AWS af-south-1 (Cape Town, ZA)',          '#a855f7', 'https://<function-url-id>.lambda-url.af-south-1.on.aws/')
ON CONFLICT (id) DO NOTHING;
