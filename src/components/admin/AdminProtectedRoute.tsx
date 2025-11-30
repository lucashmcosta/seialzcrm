import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Navigate } from 'react-router-dom';

export function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, mfaRequired, user, adminUser } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user || !adminUser) {
    return <Navigate to="/admin/login" replace />;
  }

  if (mfaRequired || !adminUser.mfa_enabled) {
    return <Navigate to="/admin/mfa-setup" replace />;
  }

  return <>{children}</>;
}
