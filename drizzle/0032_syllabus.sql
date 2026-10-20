ALTER TABLE `shared_courses` ADD `syllabus_outline` text;--> statement-breakpoint
ALTER TABLE `shared_courses` ADD `syllabus_schedule` text;--> statement-breakpoint
ALTER TABLE `shared_courses` ADD `syllabus_checked_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `shared_courses_code_idx` ON `shared_courses` (`university_id`,`year`,`code`);--> statement-breakpoint
-- Rooms typed for an online class are written オンライン, as src/lib/text.ts cleanRoom does for new saves
UPDATE `shared_course_slots` SET `room` = 'オンライン' WHERE lower(replace(`room`, ' ', '')) IN ('オンライン授業', '遠隔', '遠隔授業', 'リモート', 'リモート授業', 'online', 'zoom', 'teams', 'meet', 'googlemeet', 'webex');
--> statement-breakpoint
UPDATE `course_slots` SET `room` = 'オンライン' WHERE lower(replace(`room`, ' ', '')) IN ('オンライン授業', '遠隔', '遠隔授業', 'リモート', 'リモート授業', 'online', 'zoom', 'teams', 'meet', 'googlemeet', 'webex');
