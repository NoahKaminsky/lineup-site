// Re-mounts on every navigation, so each page settles in with one short,
// shared motion instead of snapping. Respects reduced motion (globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="lu-page-in">{children}</div>;
}
