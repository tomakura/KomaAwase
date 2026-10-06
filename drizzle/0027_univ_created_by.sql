-- Who typed in a university (source 'user'); cleared when their account is deleted
ALTER TABLE `universities` ADD `created_by` text REFERENCES users(id) ON DELETE set null;
