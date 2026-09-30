import { still } from './motion';

// How long the check mark of a sent form stays before the page shows what was sent
export const pauseAfterSent = () => new Promise<void>((resolve) => setTimeout(resolve, still() ? 0 : 650));
