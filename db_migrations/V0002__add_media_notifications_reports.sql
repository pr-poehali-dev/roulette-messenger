
ALTER TABLE t_p81104196_roulette_messenger.users 
ADD COLUMN notifications_enabled BOOLEAN;

UPDATE t_p81104196_roulette_messenger.users 
SET notifications_enabled = true 
WHERE notifications_enabled IS NULL;

ALTER TABLE t_p81104196_roulette_messenger.messages 
ADD COLUMN message_type VARCHAR(20),
ADD COLUMN media_url TEXT,
ADD COLUMN is_hidden BOOLEAN;

UPDATE t_p81104196_roulette_messenger.messages 
SET message_type = 'text',
    is_hidden = false
WHERE message_type IS NULL;

CREATE TABLE IF NOT EXISTS t_p81104196_roulette_messenger.reports (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL,
    reported_by INTEGER NOT NULL,
    reason TEXT,
    created_at TIMESTAMP NULL
);

UPDATE t_p81104196_roulette_messenger.reports
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

CREATE INDEX idx_reports_msg ON t_p81104196_roulette_messenger.reports(message_id);
