/**
 * STUB net — best-effort mirror of progress to the platform room (/ws/<room>, journey ledger in app/src/logic.js).
 * The real implementation connects lazily, never blocks gameplay and fails silently. API:
 *   net.checkpoint(chapterIndex, beatIndex) · net.flag(name, value) · net.complete() · net.status
 */
export function createNet(G) {
  void G;
  return {
    status: 'offline',
    checkpoint() {}, flag() {}, complete() {},
  };
}
