/**
 * THE RESTRAINED SPRING, as an easing: a damped spring from rest, most of the way in the first third, 2.8% past at about
 * half way and back by the end. The same curve the skin writes as `--ease-spring` (`tokens.css`), so a CSS animation and
 * a Svelte one land alike. Its own file, with nothing imported, so the answering motion (`ui/motion.ts`) and the record
 * forming (`motion/index.ts`) both read it without reading each other.
 */

const DAMP = 6.5;
const RING = (DAMP / 0.75) * Math.sqrt(1 - 0.75 * 0.75);

export const spring = (t: number): number => (t >= 1 ? 1 : t <= 0 ? 0 : 1 - Math.exp(-DAMP * t) * (Math.cos(RING * t) + (DAMP / RING) * Math.sin(RING * t)));
