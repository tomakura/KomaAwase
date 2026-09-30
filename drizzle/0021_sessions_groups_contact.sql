CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_messages_status_idx` ON `contact_messages` (`status`);--> statement-breakpoint
CREATE INDEX `contact_messages_email_idx` ON `contact_messages` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `group_bans` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `friend_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `group_requests` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`share_timetable` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `friend_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_requests_user_idx` ON `group_requests` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_counts` (
	`key` text PRIMARY KEY NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `friend_groups` ADD `approval` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `created_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_used_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `authed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `import_consent_at` integer;