import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from "react";
import * as Sentry from "@sentry/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OutboundCallProvider } from "@/contexts/OutboundCallContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { PageLoader } from "./components/common/PageLoader";
import { SiteI18nProvider } from "@/i18n/SiteI18nProvider";
import { detectLocale } from "@/i18n/config";
import { DEFAULT_LOCALE, LOCALE_TO_SLUG, SLUG_TO_LOCALE } from "@/i18n/config";
function RedirectPreserveQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

export function isStaleChunkError(error: unknown): boolean {
  const msg =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error && typeof (error as any).message === "string"
          ? (error as any).message
          : "";
  const normalized = msg.toLowerCase();
  return [
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "unable to preload css",
    "loading chunk",
    "chunkloaderror",
    "module script",
    "'text/html' is not a valid javascript mime type",
    "is not a valid javascript mime type",
    "expected a javascript module script but the server responded",
    "expected a javascript-or-wasm module script",
  ].some((entry) => normalized.includes(entry));
}

let reloadInFlight = false;

// If the browser restores this page from bfcache (back/forward navigation),
// the in-flight flag would otherwise stick at `true` and prevent future
// recovery reloads. Clear it whenever the page becomes visible again.
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", () => {
    reloadInFlight = false;
  });
}

export function reloadForChunkRecovery(): boolean {
  if (typeof window === "undefined") return false;

  // Second/N-th stale chunk failing in the same tick: reload already scheduled,
  // signal recovery so the caller suspends silently instead of throwing.
  if (reloadInFlight) return true;

  const reloadKey = "__seialz_chunk_recovery_at";
  const lastReloadAt = Number(window.sessionStorage.getItem(reloadKey) ?? "0");

  if (Date.now() - lastReloadAt < 10_000) return false;

  window.sessionStorage.setItem(reloadKey, Date.now().toString());
  reloadInFlight = true;
  window.location.reload();
  return true;
}

// Retry wrapper for dynamic imports (handles stale chunks after deployments)
function retryImport<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  return fn().catch((err) => {
    // Stale chunk after deploy: retrying the same 404 against the CDN is
    // pointless. Trigger the reload immediately and keep the lazy component
    // suspended (never-resolving Promise) so nothing surfaces to the
    // ErrorBoundary while the page reloads. reloadForChunkRecovery is
    // idempotent (in-flight flag + 10s throttle); even when throttled the
    // first scheduled reload will land, so suspending is safe.
    if (isStaleChunkError(err)) {
      reloadForChunkRecovery();
      return new Promise<T>(() => {});
    }
    if (retries > 0) {
      return new Promise<T>((resolve) => setTimeout(() => resolve(retryImport(fn, retries - 1)), 1000));
    }
    throw err;
  });
}


// Lazy load call handlers (heavy Twilio SDK) with retry
const InboundCallHandler = lazy(() =>
  retryImport(() => import("./components/calls/InboundCallHandler")).then(m => ({ default: m.InboundCallHandler }))
);
const OutboundCallHandler = lazy(() =>
  retryImport(() => import("./components/calls/OutboundCallHandler")).then(m => ({ default: m.OutboundCallHandler }))
);

// Auth pages - load immediately (small)
import SignUp from "./pages/auth/SignUp";
import SignIn from "./pages/auth/SignIn";
import ConfirmEmail from "./pages/auth/ConfirmEmail";
import AcceptInvitation from "./pages/invite/AcceptInvitation";
import LandingPage from "./pages/LandingPage";
const PrivacyPolicyPage = lazy(() => retryImport(() => import("./pages/legal/PrivacyPolicy")));
const TermsOfServicePage = lazy(() => retryImport(() => import("./pages/legal/TermsOfService")));
const DataDeletionPage = lazy(() => retryImport(() => import("./pages/legal/DataDeletion")));
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import ReportsPage from "./pages/reports/ReportsPage";

// Mobile pages
const MobileSignIn = lazy(() => retryImport(() => import("./components/mobile/auth/MobileSignIn")));

// Public docs - load immediately
import DocsIndex from "./pages/docs/DocsIndex";
import DocsModule from "./pages/docs/DocsModule";
import Health from "./pages/Health";
import DevHealth from "./pages/DevHealth";
const ApiDocs = lazy(() => retryImport(() => import("./pages/docs/ApiDocs")));


// Lazy load secondary CRM pages with retry for chunk resilience
const ContactsList = lazy(() => retryImport(() => import("./pages/contacts/ContactsList")));
const ContactDetail = lazy(() => retryImport(() => import("./pages/contacts/ContactDetail")));
const ContactForm = lazy(() => retryImport(() => import("./pages/contacts/ContactForm")));
const OpportunitiesKanban = lazy(() => retryImport(() => import("./pages/opportunities/OpportunitiesKanban")));
const OpportunityDetail = lazy(() => retryImport(() => import("./pages/opportunities/OpportunityDetail")));
const TasksList = lazy(() => retryImport(() => import("./pages/tasks/TasksList")));
const MessagesList = lazy(() => retryImport(() => import("./pages/messages/MessagesList")));
const InboxPage = lazy(() => retryImport(() => import("./pages/inbox/InboxPage")));
const MarketingOverview = lazy(() => retryImport(() => import("./pages/marketing/index")));
const MarketingAds = lazy(() => retryImport(() => import("./pages/marketing/ads/index")));
const MarketingAdDetail = lazy(() => retryImport(() => import("./pages/marketing/ads/[id]")));
const MarketingFunnel = lazy(() => retryImport(() => import("./pages/marketing/funnel")));
const MarketingTimeline = lazy(() => retryImport(() => import("./pages/marketing/timeline")));
// Settings layout + grid (replaces old Settings page)
const SettingsLayout = lazy(() => retryImport(() => import("./components/settings/SettingsLayout")).then(m => ({ default: m.SettingsLayout })));
const SettingsGrid = lazy(() => retryImport(() => import("./components/settings/SettingsGrid")).then(m => ({ default: m.SettingsGrid })));
const GeneralSettings = lazy(() => retryImport(() => import("./components/settings/GeneralSettings")).then(m => ({ default: m.GeneralSettings })));
const ThemeSettings = lazy(() => retryImport(() => import("./components/settings/ThemeSettings")).then(m => ({ default: m.ThemeSettings })));
const UsersSettings = lazy(() => retryImport(() => import("./components/settings/UsersSettings")).then(m => ({ default: m.UsersSettings })));
const PipelineSettings = lazy(() => retryImport(() => import("./components/settings/PipelineSettings")).then(m => ({ default: m.PipelineSettings })));
const DuplicatePreventionSettings = lazy(() => retryImport(() => import("./components/settings/DuplicatePreventionSettings")).then(m => ({ default: m.DuplicatePreventionSettings })));
const CustomFieldsSettings = lazy(() => retryImport(() => import("./components/settings/CustomFieldsSettings")).then(m => ({ default: m.CustomFieldsSettings })));
const TagsSettings = lazy(() => retryImport(() => import("./components/settings/TagsSettings")).then(m => ({ default: m.TagsSettings })));
const PermissionProfilesSettings = lazy(() => retryImport(() => import("./components/settings/PermissionProfilesSettings")).then(m => ({ default: m.PermissionProfilesSettings })));
const BillingSettings = lazy(() => retryImport(() => import("./components/settings/BillingSettings")).then(m => ({ default: m.BillingSettings })));
const IntegrationsSettings = lazy(() => retryImport(() => import("./components/settings/IntegrationsSettings")).then(m => ({ default: m.IntegrationsSettings })));
const ApiWebhooksSettings = lazy(() => retryImport(() => import("./components/settings/ApiWebhooksSettings")).then(m => ({ default: m.ApiWebhooksSettings })));
const AIAgentSettings = lazy(() => retryImport(() => import("./components/settings/AIAgentSettings")).then(m => ({ default: m.AIAgentSettings })));
const AIProvidersSettings = lazy(() => retryImport(() => import("./components/settings/AIProvidersSettings")).then(m => ({ default: m.AIProvidersSettings })));
const IntelligenceSettings = lazy(() => retryImport(() => import("./components/settings/IntelligenceSettings")).then(m => ({ default: m.IntelligenceSettings })));
const KnowledgeBaseSettings = lazy(() => retryImport(() => import("./components/settings/KnowledgeBaseSettings")).then(m => ({ default: m.KnowledgeBaseSettings })));
const KnowledgeEditChat = lazy(() => retryImport(() => import("./components/settings/KnowledgeEditChat")).then(m => ({ default: m.KnowledgeEditChat })));
const ProductsSettings = lazy(() => retryImport(() => import("./components/settings/ProductsSettings")).then(m => ({ default: m.ProductsSettings })));
const WhatsAppTemplatesPage = lazy(() => retryImport(() => import("./pages/settings/WhatsAppTemplates")));
const WhatsAppSnippetsPage = lazy(() => retryImport(() => import("./pages/settings/WhatsAppSnippets")));
const AuditLogs = lazy(() => retryImport(() => import("./pages/settings/AuditLogs")).then(m => ({ default: m.AuditLogs })));
const RoundRobinSettings = lazy(() => retryImport(() => import("./components/settings/RoundRobinSettings")).then(m => ({ default: m.RoundRobinSettings })));
const Trash = lazy(() => retryImport(() => import("./pages/settings/Trash")).then(m => ({ default: m.Trash })));
const DocumentsSettings = lazy(() => retryImport(() => import("./components/settings/DocumentsSettings")).then(m => ({ default: m.DocumentsSettings })));
const CustomerServiceSettings = lazy(() => retryImport(() => import("./components/settings/CustomerServiceSettings")).then(m => ({ default: m.CustomerServiceSettings })));
const WebchatSettings = lazy(() => retryImport(() => import("./components/settings/WebchatSettings")).then(m => ({ default: m.WebchatSettings })));
const Profile = lazy(() => retryImport(() => import("./pages/Profile")));
const NotFound = lazy(() => retryImport(() => import("./pages/NotFound")));

const CompaniesList = lazy(() => retryImport(() => import("./pages/companies/CompaniesList")));
const CompanyDetail = lazy(() => retryImport(() => import("./pages/companies/CompanyDetail")));
const CompanyForm = lazy(() => retryImport(() => import("./pages/companies/CompanyForm")));

// Lazy load WhatsApp Template pages
const TemplatesList = lazy(() => retryImport(() => import("./pages/whatsapp/TemplatesList")));
const TemplateForm = lazy(() => retryImport(() => import("./pages/whatsapp/TemplateForm")));
const TemplateDetail = lazy(() => retryImport(() => import("./pages/whatsapp/TemplateDetail")));

// Lazy load Admin pages
const AdminLogin = lazy(() => retryImport(() => import("./pages/admin/AdminLogin")));
const AdminMFASetup = lazy(() => retryImport(() => import("./pages/admin/AdminMFASetup")));
const AdminDashboard = lazy(() => retryImport(() => import("./pages/admin/AdminDashboard")));
const AdminOrganizations = lazy(() => retryImport(() => import("./pages/admin/AdminOrganizations")));
const AdminOrganizationDetail = lazy(() => retryImport(() => import("./pages/admin/AdminOrganizationDetail")));
const AdminUsers = lazy(() => retryImport(() => import("./pages/admin/AdminUsers")));
const AdminFeatureFlags = lazy(() => retryImport(() => import("./pages/admin/AdminFeatureFlags")));
const AdminLogs = lazy(() => retryImport(() => import("./pages/admin/AdminLogs")));
const AdminSecurity = lazy(() => retryImport(() => import("./pages/admin/AdminSecurity")));
const AdminImpersonationHistory = lazy(() => retryImport(() => import("./pages/admin/AdminImpersonationHistory")));
const AdminPlans = lazy(() => retryImport(() => import("./pages/admin/AdminPlans")));
const AdminCoupons = lazy(() => retryImport(() => import("./pages/admin/AdminCoupons")));
const AdminIntegrations = lazy(() => retryImport(() => import("./pages/admin/AdminIntegrations")));
const AdminIntegrationDetail = lazy(() => retryImport(() => import("./pages/admin/AdminIntegrationDetail")));
const AdminDocumentation = lazy(() => retryImport(() => import("./pages/admin/AdminDocumentation")));
const AdminIntegrationHealth = lazy(() => retryImport(() => import("./pages/admin/AdminIntegrationHealth")));
const AdminDocumentationEdit = lazy(() => retryImport(() => import("./pages/admin/AdminDocumentationEdit")));
const ObservabilityPage = lazy(() => retryImport(() => import("./pages/admin/ObservabilityPage")));
const AdminProtectedRoute = lazy(() => retryImport(() => import("./components/admin/AdminProtectedRoute")).then(m => ({ default: m.AdminProtectedRoute })));
const ImpersonateCallback = lazy(() => retryImport(() => import("./pages/admin/ImpersonateCallback")));
const AdminEvolution = lazy(() => retryImport(() => import("./pages/admin/AdminEvolution")));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoid refetching on every page navigation/focus
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes in cache
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

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

// Renders mobile or desktop auth component based on viewport
function ResponsiveSignIn() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileSignIn /> : <SignIn />;
}

// Global call handler - persists across all route changes
// SECURITY: Never initialize Twilio Device in admin portal - admins should NOT receive customer calls
function GlobalCallHandler() {
  const { isAuthenticated } = useAuthContext();
  const location = useLocation();
  
  // CRITICAL SECURITY: Block call handlers in admin portal
  // This prevents SaaS admins from receiving customer calls when working on admin tasks
  const isAdminRoute = location.pathname.startsWith('/admin');
  
  if (!isAuthenticated || isAdminRoute) return null;
  
  return (
    <Suspense fallback={null}>
      <InboundCallHandler />
      <OutboundCallHandler />
    </Suspense>
  );
}

// Fallback for impersonation magic links that land on "/" instead of /impersonate/callback
function RootRedirect() {
  const search = window.location.search;
  const hash = window.location.hash;
  const hasImp =
    search.includes('imp_session=') ||
    hash.includes('access_token=') ||
    hash.includes('type=magiclink') ||
    hash.includes('type=recovery');
  if (hasImp) {
    window.location.replace('/impersonate/callback' + search + hash);
    return null;
  }
  const locale = detectLocale();
  const slug = LOCALE_TO_SLUG[locale];
  return <Navigate to={`/${slug}`} replace />;
}

// Guard for /:locale/* — valida o slug e redireciona para PT-BR se inválido
function LocaleGuard({ children }: { children: React.ReactNode }) {
  const { locale } = useParams<{ locale: string }>();
  if (!locale || !(locale in SLUG_TO_LOCALE)) {
    return <Navigate to={`/${LOCALE_TO_SLUG[DEFAULT_LOCALE]}`} replace />;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <OrganizationProvider>
        <OutboundCallProvider>
        <ThemeProvider>
        <GlobalCallHandler />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          {/* Site institucional público (i18n) */}
          <Route
            path="/:locale"
            element={
              <LocaleGuard>
                <SiteI18nProvider>
                  <LandingPage />
                </SiteI18nProvider>
              </LocaleGuard>
            }
          />
          <Route
            path="/:locale/privacy-policy"
            element={
              <LocaleGuard>
                <SiteI18nProvider>
                  <PrivacyPolicyPage />
                </SiteI18nProvider>
              </LocaleGuard>
            }
          />
          <Route
            path="/:locale/terms-of-service"
            element={
              <LocaleGuard>
                <SiteI18nProvider>
                  <TermsOfServicePage />
                </SiteI18nProvider>
              </LocaleGuard>
            }
          />
          <Route
            path="/:locale/data-deletion"
            element={
              <LocaleGuard>
                <SiteI18nProvider>
                  <DataDeletionPage />
                </SiteI18nProvider>
              </LocaleGuard>
            }
          />

          {/* URLs canônicas PT (top-level, registradas no painel da Meta) */}
          <Route
            path="/politica-de-privacidade"
            element={<SiteI18nProvider><PrivacyPolicyPage /></SiteI18nProvider>}
          />
          <Route
            path="/termos-de-servico"
            element={<SiteI18nProvider><TermsOfServicePage /></SiteI18nProvider>}
          />
          <Route
            path="/exclusao-de-dados"
            element={<SiteI18nProvider><DataDeletionPage /></SiteI18nProvider>}
          />




          {/* Health / monitoring */}
          <Route path="/health" element={<Health />} />
          <Route path="/dev/health" element={<DevHealth />} />

          {/* Public Documentation */}
          <Route path="/docs" element={<DocsIndex />} />
          <Route path="/docs/api" element={<ApiDocs />} />
          <Route path="/docs/:module" element={<DocsModule />} />
          
          {/* Auth routes */}
          <Route path="/auth/signup" element={<SignUp />} />
          <Route path="/auth/signin" element={<ResponsiveSignIn />} />
          <Route path="/auth/confirm-email" element={<ConfirmEmail />} />
          <Route path="/invite/:token" element={<AcceptInvitation />} />
          <Route path="/impersonate/callback" element={<ImpersonateCallback />} />

          

          
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
          <Route path="/admin/integration-health" element={
            <AdminProtectedRoute>
              <AdminIntegrationHealth />
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
          <Route path="/obs" element={
            <AdminProtectedRoute>
              <ObservabilityPage />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/evolution" element={
            <AdminProtectedRoute>
              <AdminEvolution />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/obs" element={
            <AdminProtectedRoute>
              <ObservabilityPage />
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
            path="/commercial"
            element={
              <ProtectedRoute>
                <MessagesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages"
            element={<RedirectPreserveQuery to="/commercial" />}
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute>
                <InboxPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboards"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/reports" element={<Navigate to="/dashboards" replace />} />
          <Route path="/marketing" element={<ProtectedRoute><MarketingOverview /></ProtectedRoute>} />
          <Route path="/marketing/ads" element={<ProtectedRoute><MarketingAds /></ProtectedRoute>} />
          <Route path="/marketing/ads/:id" element={<ProtectedRoute><MarketingAdDetail /></ProtectedRoute>} />
          <Route path="/marketing/funnel" element={<ProtectedRoute><MarketingFunnel /></ProtectedRoute>} />
          <Route path="/marketing/timeline" element={<ProtectedRoute><MarketingTimeline /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsLayout /></ProtectedRoute>}>
            <Route index element={<SettingsGrid />} />
            <Route path="general" element={<GeneralSettings />} />
            <Route path="theme" element={<ThemeSettings />} />
            <Route path="users" element={<UsersSettings />} />
            <Route path="permissions" element={<PermissionProfilesSettings />} />
            <Route path="billing" element={<BillingSettings />} />
            <Route path="pipeline" element={<PipelineSettings />} />
            <Route path="duplicates" element={<DuplicatePreventionSettings />} />
            <Route path="custom-fields" element={<CustomFieldsSettings />} />
            <Route path="tags" element={<TagsSettings />} />
            <Route path="documents" element={<DocumentsSettings />} />
            <Route path="integrations" element={<IntegrationsSettings />} />
            <Route path="customer-service" element={<CustomerServiceSettings />} />
            <Route path="webchat" element={<WebchatSettings />} />
            <Route path="whatsapp-templates" element={<WhatsAppTemplatesPage />} />
            <Route path="whatsapp-snippets" element={<WhatsAppSnippetsPage />} />
            <Route path="ai-agent" element={<AIAgentSettings />} />
            <Route path="ai-providers" element={<AIProvidersSettings />} />
            <Route path="intelligence" element={<IntelligenceSettings />} />
            <Route path="api-webhooks" element={<ApiWebhooksSettings />} />
            <Route path="products" element={<ProductsSettings />} />
            <Route path="knowledge-base" element={<KnowledgeBaseSettings />} />
            <Route path="edit-kb" element={<KnowledgeEditChat />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="round-robin" element={<RoundRobinSettings />} />
            <Route path="trash" element={<Trash />} />
            <Route path="*" element={<Navigate to="/settings" replace />} />
          </Route>
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
          
          {/* WhatsApp Templates routes */}
          <Route
            path="/whatsapp/templates"
            element={
              <ProtectedRoute>
                <TemplatesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp/templates/new"
            element={
              <ProtectedRoute>
                <TemplateForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp/templates/:id"
            element={
              <ProtectedRoute>
                <TemplateDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp/templates/:id/edit"
            element={
              <ProtectedRoute>
                <TemplateForm />
              </ProtectedRoute>
            }
          />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ThemeProvider>
        </OutboundCallProvider>
        </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
