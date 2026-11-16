/** Real-game scene for chapter tests: ?m=play&test=1[&ch=N&beat=id] — assets load through the director, like the shipped game. */
export const assets = [];
export async function run(G, p) { if (p.ch) G.sys.director.startChapter(+p.ch, p.beat || null); return {}; }
