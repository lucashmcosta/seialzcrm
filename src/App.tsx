import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OutboundCallProvider } from "@/contexts/OutboundCallContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PageLoader } from "./components/common/PageLoader";
// Lazy load call handlers (heavy Twilio SDK)
const InboundCallHandler = lazy(() => import("./components/calls/InboundCallHandler").then(m => ({ default: m.InboundCallHandler })));
const OutboundCallHandler = lazy(() => import("./components/calls/OutboundCallHandler").then(m => ({ default: m.OutboundCallHandler })));

// Auth pages - load immediately (small)
import SignUp from "./pages/auth/SignUp";
import SignIn from "./pages/auth/SignIn";
import ConfirmEmail from "./pages/auth/ConfirmEmail";
import AcceptInvitation from "./pages/invite/AcceptInvitation";

// Public docs - load immediately
import DocsIndex from "./pages/docs/DocsIndex";
import DocsModule from "./pages/docs/DocsModule";

// Lazy load CRM pages
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ContactsList = lazy(() => import("./pages/contacts/ContactsList"));
const ContactDetail = lazy(() => import("./pages/contacts/ContactDetail"));
const ContactForm = lazy(() => import("./pages/contacts/ContactForm"));
const OpportunitiesKanban = lazy(() => import("./pages/opportunities/OpportunitiesKanban"));
const OpportunityDetail = lazy(() => import("./pages/opportunities/OpportunityDetail"));
const TasksList = lazy(() => import("./pages/tasks/TasksList"));
const MessagesList = lazy(() => import("./pages/messages/MessagesList"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CompaniesList = lazy(() => import("./pages/companies/CompaniesList"));
const CompanyDetail = lazy(() => import("./pages/companies/CompanyDetail"));
const CompanyForm = lazy(() => import("./pages/companies/CompanyForm"));

// Lazy load Admin pages
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminMFASetup = lazy(() => import("./pages/admin/AdminMFASetup"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminOrganizations = lazy(() => import("./pages/admin/AdminOrganizations"));
const AdminOrganizationDetail = lazy(() => import("./pages/admin/AdminOrganizationDetail"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminFeatureFlags = lazy(() => import("./pages/admin/AdminFeatureFlags"));
const AdminLogs = lazy(() => import("./pages/admin/AdminLogs"));
const AdminSecurity = lazy(() => import("./pages/admin/AdminSecurity"));
const AdminImpersonationHistory = lazy(() => import("./pages/admin/AdminImpersonationHistory"));
const AdminPlans = lazy(() => import("./pages/admin/AdminPlans"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminIntegrations = lazy(() => import("./pages/admin/AdminIntegrations"));
const AdminIntegrationDetail = lazy(() => import("./pages/admin/AdminIntegrationDetail"));
const AdminDocumentation = lazy(() => import("./pages/admin/AdminDocumentation"));
const AdminDocumentationEdit = lazy(() => import("./pages/admin/AdminDocumentationEdit"));
const AdminProtectedRoute = lazy(() => import("./components/admin/AdminProtectedRoute").then(m => ({ default: m.AdminProtectedRoute })));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthContext();

  if (loading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/signin" replace />;
  }

  return <>{children}</>;
}

// Global call handler - persists across all route changes
function GlobalCallHandler() {
  const { isAuthenticated } = useAuthContext();
  
  if (!isAuthenticated) return null;
  
  return (
    <Suspense fallback={null}>
      <InboundCallHandler />
      <OutboundCallHandler />
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <OutboundCallProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <OrganizationProvider>
        <ThemeProvider>
        <GlobalCallHandler />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Public Documentation */}
          <Route path="/docs" element={<DocsIndex />} />
          <Route path="/docs/:module" element={<DocsModule />} />
          
          {/* Auth routes */}
          <Route path="/auth/signup" element={<SignUp />} />
          <Route path="/auth/signin" element={<SignIn />} />
          <Route path="/auth/confirm-email" element={<ConfirmEmail />} />
          <Route path="/invite/:token" element={<AcceptInvitation />} />
          
          {/* Admin Portal routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/mfa-setup" element={<AdminMFASetup />} />
          <Route path="/admin" element={
            <AdminProtectedRoute>
              <AdminDashboard />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/organizations" element={
            <AdminProtectedRoute>
              <AdminOrganizations />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/organizations/:id" element={
            <AdminProtectedRoute>
              <AdminOrganizationDetail />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/logs" element={
            <AdminProtectedRoute>
              <AdminLogs />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <AdminProtectedRoute>
              <AdminUsers />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/feature-flags" element={
            <AdminProtectedRoute>
              <AdminFeatureFlags />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/security" element={
            <AdminProtectedRoute>
              <AdminSecurity />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/impersonations" element={
            <AdminProtectedRoute>
              <AdminImpersonationHistory />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/plans" element={
            <AdminProtectedRoute>
              <AdminPlans />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/coupons" element={
            <AdminProtectedRoute>
              <AdminCoupons />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/integrations" element={
            <AdminProtectedRoute>
              <AdminIntegrations />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/integrations/:id" element={
            <AdminProtectedRoute>
              <AdminIntegrationDetail />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/documentation" element={
            <AdminProtectedRoute>
              <AdminDocumentation />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/documentation/:module" element={
            <AdminProtectedRoute>
              <AdminDocumentationEdit />
            </AdminProtectedRoute>
          } />
          
          {/* CRM routes */}
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
            path="/messages"
            element={
              <ProtectedRoute>
                <MessagesList />
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
            path="/companies"
            element={
              <ProtectedRoute>
                <CompaniesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/new"
            element={
              <ProtectedRoute>
                <CompanyForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:id"
            element={
              <ProtectedRoute>
                <CompanyDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:id/edit"
            element={
              <ProtectedRoute>
                <CompanyForm />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ThemeProvider>
        </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </OutboundCallProvider>
  </QueryClientProvider>
);

export default App;
