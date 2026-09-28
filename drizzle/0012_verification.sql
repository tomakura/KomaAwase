CREATE TABLE `univ_verifications` (
	`user_id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`email` text NOT NULL,
	`verified_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `univ_verifications_email_unique` ON `univ_verifications` (`email`);--> statement-breakpoint
CREATE TABLE `verify_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`university_id` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `verify_tokens_user_idx` ON `verify_tokens` (`user_id`);