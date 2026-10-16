// Like 2026.10.16-002: the day it was put out, and the how-manyth change that day (scripts/app-version.mjs)
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
