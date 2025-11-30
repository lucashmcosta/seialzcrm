import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import SignUp from "./pages/auth/SignUp";
import SignIn from "./pages/auth/SignIn";
import ConfirmEmail from "./pages/auth/ConfirmEmail";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import ContactsList from "./pages/contacts/ContactsList";
import ContactDetail from "./pages/contacts/ContactDetail";
import ContactForm from "./pages/contacts/ContactForm";
import OpportunitiesKanban from "./pages/opportunities/OpportunitiesKanban";
import OpportunityDetail from "./pages/opportunities/OpportunityDetail";
import TasksList from "./pages/tasks/TasksList";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import SaaSAdmin from "./pages/admin/SaaSAdmin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/signin" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/auth/signup" element={<SignUp />} />
          <Route path="/auth/signin" element={<SignIn />} />
          <Route path="/auth/confirm-email" element={<ConfirmEmail />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts"
            element={
              <ProtectedRoute>
                <ContactsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts/new"
            element={
              <ProtectedRoute>
                <ContactForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts/:id"
            element={
              <ProtectedRoute>
                <ContactDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts/:id/edit"
            element={
              <ProtectedRoute>
                <ContactForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/opportunities"
            element={
              <ProtectedRoute>
                <OpportunitiesKanban />
              </ProtectedRoute>
            }
          />
          <Route
            path="/opportunities/:id"
            element={
              <ProtectedRoute>
                <OpportunityDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <TasksList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/saas-admin"
            element={
              <ProtectedRoute>
                <SaaSAdmin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
