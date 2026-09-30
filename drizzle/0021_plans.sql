CREATE TABLE `cancellation_hides` (
	`shared_course_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`shared_course_id`, `date`),
	FOREIGN KEY (`shared_course_id`) REFERENCES `shared_courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `course_absences` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_absences_course_date_idx` ON `course_absences` (`course_id`,`date`);--> statement-breakpoint
CREATE TABLE `daily_stats` (
	`date` text PRIMARY KEY NOT NULL,
	`users` integer NOT NULL,
	`active_day` integer NOT NULL,
	`active_week` integer NOT NULL,
	`verified` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`place` text,
	`memo` text,
	`course_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `events_user_date_idx` ON `events` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`sent_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`acknowledged_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `warnings_user_idx` ON `warnings` (`user_id`);--> statement-breakpoint
ALTER TABLE `courses` ADD `credits` real;--> statement-breakpoint
ALTER TABLE `courses` ADD `absence_limit` integer;--> statement-breakpoint
ALTER TABLE `shared_courses` ADD `credits` real;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `share_cancellations` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` integer;