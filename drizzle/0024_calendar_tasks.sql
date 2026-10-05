CREATE TABLE `calendar_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`timetable_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`timetable_id`) REFERENCES `timetables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_entries_timetable_idx` ON `calendar_entries` (`timetable_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `course_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`period` integer NOT NULL,
	`span` integer DEFAULT 1 NOT NULL,
	`room` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_moves_course_idx` ON `course_moves` (`course_id`);--> statement-breakpoint
ALTER TABLE `course_notes` ADD `due_time` text;--> statement-breakpoint
ALTER TABLE `course_notes` ADD `submit_to` text;--> statement-breakpoint
ALTER TABLE `course_notes` ADD `steps` text;--> statement-breakpoint
ALTER TABLE `course_notes` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `exam` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `scope` text;--> statement-breakpoint
ALTER TABLE `events` ADD `bring` text;--> statement-breakpoint
ALTER TABLE `universities` ADD `calendar_preset` text;