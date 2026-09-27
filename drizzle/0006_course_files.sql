CREATE TABLE `course_files` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_files_storage_key_unique` ON `course_files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `course_files_course_idx` ON `course_files` (`course_id`);