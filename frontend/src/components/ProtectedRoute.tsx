export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Auth check is handled by zustand persist + route guards in App.tsx
  return <>{children}</>;
}
