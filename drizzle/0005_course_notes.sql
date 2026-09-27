CREATE TABLE `course_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text,
	`body` text DEFAULT '' NOT NULL,
	`due` text,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_notes_course_idx` ON `course_notes` (`course_id`);