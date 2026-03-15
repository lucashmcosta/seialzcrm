import { SpinnerGap } from '@phosphor-icons/react';

export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <SpinnerGap className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
