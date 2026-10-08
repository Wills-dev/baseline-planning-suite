/** A small request guard shared by project reads and mutation responses. */
export function createLatestProjectRequest() {
  let version = 0;
  return {
    next: () => ++version,
    isCurrent: (request: number) => request === version,
    cancel: () => {
      version++;
    },
  };
}
