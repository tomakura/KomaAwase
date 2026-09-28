ALTER TABLE `universities` ADD `source` text DEFAULT 'preset' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `universities_name_idx` ON `universities` (`name`);--> statement-breakpoint
ALTER TABLE `users` ADD `university_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `setup_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `friend_code` text;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_friend_code_unique` ON `users` (`friend_code`);--> statement-breakpoint
-- Students have addresses under dhw.ac.jp or its subdomains.
UPDATE `universities` SET `email_domains` = '["dhw.ac.jp"]' WHERE `id` = 'dhw';--> statement-breakpoint
-- People who already have a timetable started before はじめの設定 existed; they keep what they have.
UPDATE `users` SET
	`setup_at` = unixepoch() * 1000,
	`university_id` = (SELECT `university_id` FROM `timetables` WHERE `timetables`.`user_id` = `users`.`id` ORDER BY `year` DESC LIMIT 1)
WHERE `id` IN (SELECT `user_id` FROM `timetables`);
