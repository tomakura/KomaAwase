CREATE TABLE `metrics` (
	`hour` text NOT NULL,
	`name` text NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	`total_ms` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`hour`, `name`)
);
--> statement-breakpoint
CREATE TABLE `status_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `undo_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`row` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `undo_items_user_idx` ON `undo_items` (`user_id`);--> statement-breakpoint
ALTER TABLE `courses` ADD `shared_seen_at` integer;--> statement-breakpoint
ALTER TABLE `feedback` ADD `reply` text;--> statement-breakpoint
ALTER TABLE `feedback` ADD `replied_at` integer;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `last_ok_at` integer;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `last_failed_at` integer;