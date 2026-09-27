// Names match the --course-* variables in app.css.
export const COURSE_COLORS = [
	'red',
	'orange',
	'yellow',
	'lime',
	'green',
	'mint',
	'blue',
	'indigo',
	'purple',
	'gray'
] as const;

export function courseColor(name: string) {
	const color = (COURSE_COLORS as readonly string[]).includes(name) ? name : 'gray';
	return `var(--course-${color})`;
}
