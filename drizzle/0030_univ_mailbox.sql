ALTER TABLE `univ_verifications` ADD `mailbox` text;--> statement-breakpoint
CREATE UNIQUE INDEX `univ_verifications_mailbox_unique` ON `univ_verifications` (`mailbox`);--> statement-breakpoint
-- Checks so far get their mailbox, as mailboxOf in src/lib/server/verify.ts gives it (the address without a +tag).
-- When checks of several accounts share one mailbox, it goes to one of them (the address without a tag, or else
-- the earliest check); the others stay null and keep their check, and are refused when they confirm again.
UPDATE `univ_verifications` SET `mailbox` = `m`.`mailbox`
FROM (
	SELECT `user_id`, `mailbox`, row_number() OVER (PARTITION BY `mailbox` ORDER BY `email` <> `mailbox`, `verified_at`, `user_id`) AS `n`
	FROM (
		SELECT `user_id`, `email`, `verified_at`,
			CASE WHEN instr(substr(`email`, 1, instr(`email`, '@') - 1), '+') > 1
				THEN substr(`email`, 1, instr(`email`, '+') - 1) || substr(`email`, instr(`email`, '@'))
				ELSE `email` END AS `mailbox`
		FROM `univ_verifications`
	)
) AS `m`
WHERE `m`.`user_id` = `univ_verifications`.`user_id` AND `m`.`n` = 1;
