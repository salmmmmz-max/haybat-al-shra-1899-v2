/** Chapter registry. Order = story order (director.startChapter(n) → CHAPTERS[n - 1]). */
import ch1 from './ch1.js';
import ch2 from './ch2.js';
import ch3 from './ch3.js';
import ch4 from './ch4.js';
import ch5 from './ch5.js';

/** @type {any[]} */
export const CHAPTERS = [ch1, ch2, ch3, ch4, ch5];
