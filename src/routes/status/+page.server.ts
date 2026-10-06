import { redirect } from '@sveltejs/kit';
import { STATUS_PAGE_URL } from '$lib/status';
import type { PageServerLoad } from './$types';

// The status page moved to UptimeFlare; old links and bookmarks go there
export const load: PageServerLoad = () => redirect(308, STATUS_PAGE_URL);
