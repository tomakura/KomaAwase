// Like 2026.10.16-002: the day it was put out, and the how-manyth change that day (scripts/app-version.mjs)
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// Every version on main, newest first, with the pull request it went out in, for 更新情報.
// Empty when the build had no history.
export const APP_HISTORY: { version: string; pr: number | null }[] = typeof __APP_HISTORY__ === 'object' ? __APP_HISTORY__ : [];
