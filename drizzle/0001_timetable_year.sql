DROP INDEX `timetables_user_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `timetables_user_year_idx` ON `timetables` (`user_id`,`year`);--> statement-breakpoint
ALTER TABLE `terms` ADD `group_name` text;