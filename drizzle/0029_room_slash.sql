-- Rooms split by a slash are written E15 / E16, as src/lib/text.ts cleanRoom does for new saves
UPDATE `shared_course_slots` SET `room` = trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(`room`, '／', '/'), char(12288), ' '), ' /', '/'), ' /', '/'), ' /', '/'), '/ ', '/'), '/ ', '/'), '/ ', '/'), '/', ' / ')) WHERE instr(`room`, '/') > 0 OR instr(`room`, '／') > 0;
--> statement-breakpoint
UPDATE `course_slots` SET `room` = trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(`room`, '／', '/'), char(12288), ' '), ' /', '/'), ' /', '/'), ' /', '/'), '/ ', '/'), '/ ', '/'), '/ ', '/'), '/', ' / ')) WHERE instr(`room`, '/') > 0 OR instr(`room`, '／') > 0;
