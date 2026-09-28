import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { groupMembers, users } from './db/schema';
import { removeUserFiles } from './files';
import { leaveGroup } from './groups';

/**
 * Deletes the account as docs/data-model.md describes. Files on the rental server go
 * first, some at a time ('more' asks the caller to come back for the rest), so a failure
 * there never leaves files nobody can reach. Groups pass to another member. Deleting the
 * user row takes everything personal with it; shared course edits, reports and feedback
 * stay, with the user cleared.
 */
export async function deleteAccount(env: Env, db: Db, userId: string): Promise<'more' | 'done'> {
	if ((await removeUserFiles(env, db, userId)) > 0) return 'more';
	const memberships = await db
		.select({ groupId: groupMembers.groupId })
		.from(groupMembers)
		.where(eq(groupMembers.userId, userId));
	for (const m of memberships) await leaveGroup(db, m.groupId, userId);
	await db.delete(users).where(eq(users.id, userId));
	return 'done';
}
