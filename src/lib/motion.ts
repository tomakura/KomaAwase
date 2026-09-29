import { cubicOut } from 'svelte/easing';

// Whether the person asked their device for less motion: then things appear and go at once
export const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Options for a Svelte transition (slide, fade) on a thing that comes or goes
export const motion = (duration = 240) => ({ duration: still() ? 0 : duration, easing: cubicOut });
