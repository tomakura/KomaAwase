DROP INDEX `course_absences_course_date_idx`;--> statement-breakpoint
ALTER TABLE `course_absences` ADD `period` integer DEFAULT -1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `course_absences_course_date_period_idx` ON `course_absences` (`course_id`,`date`,`period`);--> statement-breakpoint
ALTER TABLE `courses` ADD `attendance_url` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `online_url` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `online_password` text;