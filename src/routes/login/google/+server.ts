import { redirect } from '@sveltejs/kit';
import { googleEnabled, startGoogle } from '$lib/server/auth/google';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ platform, url, cookies }) => {
	if (!platform || !googleEnabled(platform.env)) redirect(303, '/login');
	redirect(302, startGoogle(platform.env, url.origin, cookies).toString());
};
