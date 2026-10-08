CREATE TABLE `bridge_connections` (
	`service_id` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`binding_hash` text NOT NULL,
	`state` text NOT NULL,
	`key_value` text,
	`last_test_json` text,
	`revision` text NOT NULL,
	`updated_at` text NOT NULL
);
