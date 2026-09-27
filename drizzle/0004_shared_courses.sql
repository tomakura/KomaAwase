CREATE TABLE `shared_course_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`shared_course_id` text NOT NULL,
	`user_id` text,
	`diff` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`shared_course_id`) REFERENCES `shared_courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shared_course_edits_course_idx` ON `shared_course_edits` (`shared_course_id`);--> statement-breakpoint
CREATE TABLE `shared_course_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`shared_course_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`period_number` integer NOT NULL,
	`span` integer DEFAULT 1 NOT NULL,
	`room` text,
	FOREIGN KEY (`shared_course_id`) REFERENCES `shared_courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shared_course_slots_course_idx` ON `shared_course_slots` (`shared_course_id`);--> statement-breakpoint
CREATE INDEX `shared_course_slots_slot_idx` ON `shared_course_slots` (`weekday`,`period_number`);--> statement-breakpoint
CREATE TABLE `shared_course_teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`shared_course_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`shared_course_id`) REFERENCES `shared_courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shared_course_teachers_course_idx` ON `shared_course_teachers` (`shared_course_id`);--> statement-breakpoint
CREATE TABLE `shared_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`year` integer NOT NULL,
	`code` text,
	`title` text NOT NULL,
	`terms` text DEFAULT '[]' NOT NULL,
	`delivery` text,
	`intensive_from` text,
	`intensive_to` text,
	`source` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shared_courses_university_year_idx` ON `shared_courses` (`university_id`,`year`);