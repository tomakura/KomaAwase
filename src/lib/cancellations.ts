// Shared cancellations: what other people syncing the same class have marked as 休講.
// Only a count is ever shown, never who.

// How many others it takes before a timetable cell says 休講かも; one person's word only shows in the detail
export const MAYBE_MIN = 2;

export const votesLabel = (n: number) => `${n}人が休講と入れています`;

export const CANCEL_REPORT_REASON = 'まちがい・いたずら';
