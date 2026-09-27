-- Digital Hollywood University: quarters and 6 periods from the 2026 academic calendar.
-- Update term_preset each year; dates from another year are not copied into new timetables.
INSERT INTO `universities` (`id`, `name`, `email_domains`, `term_preset`, `period_preset`) VALUES (
	'dhw',
	'デジタルハリウッド大学',
	'[]',
	'[{"name":"Q1","group":"前期","start":"2026-04-01","end":"2026-06-09"},{"name":"Q2","group":"前期","start":"2026-06-10","end":"2026-08-11"},{"name":"Q3","group":"後期","start":"2026-09-24","end":"2026-11-25"},{"name":"Q4","group":"後期","start":"2026-11-30","end":"2027-02-08"}]',
	'[{"number":1,"start":"08:40","end":"10:10"},{"number":2,"start":"10:20","end":"11:50"},{"number":3,"start":"12:40","end":"14:10"},{"number":4,"start":"14:20","end":"15:50"},{"number":5,"start":"16:00","end":"17:30"},{"number":6,"start":"17:40","end":"19:10"}]'
);
