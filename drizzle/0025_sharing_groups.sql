ALTER TABLE `group_members` ADD `free_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `group_members` ADD `role` text;--> statement-breakpoint
ALTER TABLE `group_requests` ADD `free_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `friend_groups` ADD `invite_expires_at` integer;--> statement-breakpoint
ALTER TABLE `friend_groups` ADD `invite_uses_left` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `friend_share` text DEFAULT 'all' NOT NULL;