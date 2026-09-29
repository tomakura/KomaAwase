CREATE TABLE `class_reminders` (
	`user_id` text NOT NULL,
	`minutes` integer NOT NULL,
	PRIMARY KEY(`user_id`, `minutes`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
