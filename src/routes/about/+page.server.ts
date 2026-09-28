import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ platform }) => ({ supportUrl: platform?.env.SUPPORT_URL || null });
