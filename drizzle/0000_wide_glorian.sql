CREATE TABLE `bridge_operations` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL
);
