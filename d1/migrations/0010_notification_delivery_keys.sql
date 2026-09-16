ALTER TABLE app_notification_deliveries ADD COLUMN delivery_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS app_notification_delivery_key_idx
  ON app_notification_deliveries(delivery_key)
  WHERE delivery_key IS NOT NULL;
