CREATE TABLE `course_absences` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_absences_course_date_idx` ON `course_absences` (`course_id`,`date`);--> statement-breakpoint
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
ALTER TABLE `courses` ADD `credits` real;--> statement-breakpoint
ALTER TABLE `courses` ADD `absence_limit` integer;--> statement-breakpoint
ALTER TABLE `shared_courses` ADD `credits` real;