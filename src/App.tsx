import { Suspense, lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import * as Sentry from "@sentry/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TelephonyProvider } from "@/contexts/OutboundCallContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { PageLoader } from "./components/common/PageLoader";
import { SiteI18nProvider } from "@/i18n/SiteI18nProvider";
import { detectLocale, type Locale } from "@/i18n/config";
import { resolveInitialLocale } from "@/i18n/geoLocale";
import { DEFAULT_LOCALE, LOCALE_TO_SLUG, SLUG_TO_LOCALE } from "@/i18n/config";
import { CallHandlersBoundary } from "@/components/calls/CallHandlersBoundary";
import { hardRefreshApp } from "@/hooks/useVersionCheck";

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
    // Variant: module resolved but payload is undefined / missing default export.
    // React.lazy's mountLazyComponent throws exactly this when payload._result is undefined.
    "cannot read properties of undefined (reading 'default')",
    "cannot read property 'default' of undefined",
    "undefined is not an object (evaluating 'default')",
    // WebKit prints the receiver name with the minified React.lazy internal
    // slot, e.g. `evaluating 'e._result.default'`. Match the stable substring.
    "_result.default",
    "evaluating '_result",
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
  const attemptsKey = "__seialz_chunk_recovery_attempts";
  const lastReloadAt = Number(window.sessionStorage.getItem(reloadKey) ?? "0");

  if (Date.now() - lastReloadAt < 10_000) return false;

  const attempts = Number(window.sessionStorage.getItem(attemptsKey) ?? "0");
  window.sessionStorage.setItem(reloadKey, Date.now().toString());
  window.sessionStorage.setItem(attemptsKey, String(attempts + 1));
  reloadInFlight = true;

  // First attempt: a plain reload is enough when the HTML revalidates.
  // Any later attempt in the same session means the reload came back with the
  // same stale asset references (cached index.html / service worker), so
  // escalate to a hard refresh: unregister SWs, flush caches and bust the URL.
  if (attempts === 0) {
    window.location.reload();
    return true;
  }

  hardRefreshApp().catch(() => window.location.reload());
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

/**
 * Wraps `retryImport` + `React.lazy` and hardens the resolved payload.
 *
 * If the dynamic import resolves but the module is `undefined` / missing the
 * expected export, React.lazy would throw `Cannot read properties of
 * undefined (reading 'default')` inside `mountLazyComponent`, bypassing our
 * retryImport catch. This helper validates the payload; on a bad payload it
 * emits a Sentry breadcrumb naming the module, triggers the same silent
 * reload recovery we use for stale chunks, and returns a never-resolving
 * Promise so Suspense stays suspended while the page reloads.
 */
function lazyWithRetry<T extends ComponentType<any>>(
  name: string,
  importer: () => Promise<any>,
  exportName: string = "default",
): LazyExoticComponent<T> {
  return lazy(() =>
    retryImport(importer).then((mod: any) => {
      const exported = mod && typeof mod === "object" ? mod[exportName] : undefined;
      if (exported === undefined) {
        try {
          Sentry.addBreadcrumb({
            category: "lazy",
            level: "warning",
            message: "module_missing_export",
            data: {
              name,
              exportName,
              modType: typeof mod,
              keys: mod && typeof mod === "object" ? Object.keys(mod).slice(0, 20) : null,
            },
          });
        } catch {
          // Sentry unavailable: recovery still proceeds.
        }
        reloadForChunkRecovery();
        return new Promise<{ default: T }>(() => {});
      }
      return { default: exported as T };
    }),
  );
}




// Lazy load call handlers (heavy Twilio SDK) with retry
const InboundCallHandler = lazyWithRetry("InboundCallHandler", () => import("./components/calls/InboundCallHandler"), "InboundCallHandler");
const OutboundCallHandler = lazyWithRetry("OutboundCallHandler", () => import("./components/calls/OutboundCallHandler"), "OutboundCallHandler");

// Auth pages - load immediately (small)
import SignUp from "./pages/auth/SignUp";
import SignIn from "./pages/auth/SignIn";
import ConfirmEmail from "./pages/auth/ConfirmEmail";
import AcceptInvitation from "./pages/invite/AcceptInvitation";
import LandingPage from "./pages/LandingPage";
const PrivacyPolicyPage = lazyWithRetry("PrivacyPolicyPage", () => import("./pages/legal/PrivacyPolicy"));
const TermsOfServicePage = lazyWithRetry("TermsOfServicePage", () => import("./pages/legal/TermsOfService"));
const DataDeletionPage = lazyWithRetry("DataDeletionPage", () => import("./pages/legal/DataDeletion"));
const SupportPage = lazyWithRetry("SupportPage", () => import("./pages/legal/Support"));
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import ReportsPage from "./pages/reports/ReportsPage";

// Mobile pages
const MobileSignIn = lazyWithRetry("MobileSignIn", () => import("./components/mobile/auth/MobileSignIn"));

// Public docs - load immediately
import DocsIndex from "./pages/docs/DocsIndex";
import DocsModule from "./pages/docs/DocsModule";
import Health from "./pages/Health";
import DevHealth from "./pages/DevHealth";


const ApiDocs = lazyWithRetry("ApiDocs", () => import("./pages/docs/ApiDocs"));


// Lazy load secondary CRM pages with retry for chunk resilience
const ContactsList = lazyWithRetry("ContactsList", () => import("./pages/contacts/ContactsList"));
const ContactDetail = lazyWithRetry("ContactDetail", () => import("./pages/contacts/ContactDetail"));
const ContactForm = lazyWithRetry("ContactForm", () => import("./pages/contacts/ContactForm"));
const OpportunitiesKanban = lazyWithRetry("OpportunitiesKanban", () => import("./pages/opportunities/OpportunitiesKanban"));
const OpportunityDetail = lazyWithRetry("OpportunityDetail", () => import("./pages/opportunities/OpportunityDetail"));
const TasksList = lazyWithRetry("TasksList", () => import("./pages/tasks/TasksList"));
const MessagesList = lazyWithRetry("MessagesList", () => import("./pages/messages/MessagesList"));
const InboxPage = lazyWithRetry("InboxPage", () => import("./pages/inbox/InboxPage"));
const MarketingOverview = lazyWithRetry("MarketingOverview", () => import("./pages/marketing/index"));
const MarketingAds = lazyWithRetry("MarketingAds", () => import("./pages/marketing/ads/index"));
const MarketingOrganic = lazyWithRetry("MarketingOrganic", () => import("./pages/marketing/organic/index"));
const MarketingAdDetail = lazyWithRetry("MarketingAdDetail", () => import("./pages/marketing/ads/[id]"));
const MarketingFunnel = lazyWithRetry("MarketingFunnel", () => import("./pages/marketing/funnel"));
const MarketingTimeline = lazyWithRetry("MarketingTimeline", () => import("./pages/marketing/timeline"));
const MarketingPosts = lazyWithRetry("MarketingPosts", () => import("./pages/marketing/posts/index"));
const MarketingComments = lazyWithRetry("MarketingComments", () => import("./pages/marketing/comments/index"));
const MarketingWebhooks = lazyWithRetry("MarketingWebhooks", () => import("./pages/marketing/webhooks/index"));
const MarketingCampaigns = lazyWithRetry("MarketingCampaigns", () => import("./pages/marketing/campaigns/index"));
const SocialInboxPage = lazyWithRetry("SocialInboxPage", () => import("./pages/social/index"));
// Settings layout + grid (replaces old Settings page)
const SettingsLayout = lazyWithRetry("SettingsLayout", () => import("./components/settings/SettingsLayout"), "SettingsLayout");
const SettingsGrid = lazyWithRetry("SettingsGrid", () => import("./components/settings/SettingsGrid"), "SettingsGrid");
const GeneralSettings = lazyWithRetry("GeneralSettings", () => import("./components/settings/GeneralSettings"), "GeneralSettings");
const ThemeSettings = lazyWithRetry("ThemeSettings", () => import("./components/settings/ThemeSettings"), "ThemeSettings");
const UsersSettings = lazyWithRetry("UsersSettings", () => import("./components/settings/UsersSettings"), "UsersSettings");
const PipelineSettings = lazyWithRetry("PipelineSettings", () => import("./components/settings/PipelineSettings"), "PipelineSettings");
const OpportunityCloseSettings = lazyWithRetry("OpportunityCloseSettings", () => import("./components/settings/OpportunityCloseSettings"), "OpportunityCloseSettings");
const DuplicatePreventionSettings = lazyWithRetry("DuplicatePreventionSettings", () => import("./components/settings/DuplicatePreventionSettings"), "DuplicatePreventionSettings");
const CustomFieldsSettings = lazyWithRetry("CustomFieldsSettings", () => import("./components/settings/CustomFieldsSettings"), "CustomFieldsSettings");
const TagsSettings = lazyWithRetry("TagsSettings", () => import("./components/settings/TagsSettings"), "TagsSettings");
const PermissionProfilesSettings = lazyWithRetry("PermissionProfilesSettings", () => import("./components/settings/PermissionProfilesSettings"), "PermissionProfilesSettings");
const BillingSettings = lazyWithRetry("BillingSettings", () => import("./components/settings/BillingSettings"), "BillingSettings");
const IntegrationsSettings = lazyWithRetry("IntegrationsSettings", () => import("./components/settings/IntegrationsSettings"), "IntegrationsSettings");
const MetaIntegrationPage = lazyWithRetry("MetaIntegrationPage", () => import("./pages/settings/MetaIntegrationPage"));
const ApiWebhooksSettings = lazyWithRetry("ApiWebhooksSettings", () => import("./components/settings/ApiWebhooksSettings"), "ApiWebhooksSettings");
const AIAgentSettings = lazyWithRetry("AIAgentSettings", () => import("./components/settings/AIAgentSettings"), "AIAgentSettings");
const AIProvidersSettings = lazyWithRetry("AIProvidersSettings", () => import("./components/settings/AIProvidersSettings"), "AIProvidersSettings");
const IntelligenceSettings = lazyWithRetry("IntelligenceSettings", () => import("./components/settings/IntelligenceSettings"), "IntelligenceSettings");
const KnowledgeBaseSettings = lazyWithRetry("KnowledgeBaseSettings", () => import("./components/settings/KnowledgeBaseSettings"), "KnowledgeBaseSettings");
const KnowledgeEditChat = lazyWithRetry("KnowledgeEditChat", () => import("./components/settings/KnowledgeEditChat"), "KnowledgeEditChat");
const ProductsSettings = lazyWithRetry("ProductsSettings", () => import("./components/settings/ProductsSettings"), "ProductsSettings");
const WhatsAppTemplatesPage = lazyWithRetry("WhatsAppTemplatesPage", () => import("./pages/settings/WhatsAppTemplates"));
const WhatsAppSnippetsPage = lazyWithRetry("WhatsAppSnippetsPage", () => import("./pages/settings/WhatsAppSnippets"));
const AuditLogs = lazyWithRetry("AuditLogs", () => import("./pages/settings/AuditLogs"), "AuditLogs");
const RoundRobinSettings = lazyWithRetry("RoundRobinSettings", () => import("./components/settings/RoundRobinSettings"), "RoundRobinSettings");
const Trash = lazyWithRetry("Trash", () => import("./pages/settings/Trash"), "Trash");
const DocumentsSettings = lazyWithRetry("DocumentsSettings", () => import("./components/settings/DocumentsSettings"), "DocumentsSettings");
const CustomerServiceSettings = lazyWithRetry("CustomerServiceSettings", () => import("./components/settings/CustomerServiceSettings"), "CustomerServiceSettings");
const WebchatSettings = lazyWithRetry("WebchatSettings", () => import("./components/settings/WebchatSettings"), "WebchatSettings");
const SalesWhatsAppPage = lazyWithRetry("SalesWhatsAppPage", () => import("./pages/settings/SalesWhatsAppPage"));
const Profile = lazyWithRetry("Profile", () => import("./pages/Profile"));
const NotFound = lazyWithRetry("NotFound", () => import("./pages/NotFound"));

const CompaniesList = lazyWithRetry("CompaniesList", () => import("./pages/companies/CompaniesList"));
const CompanyDetail = lazyWithRetry("CompanyDetail", () => import("./pages/companies/CompanyDetail"));
const CompanyForm = lazyWithRetry("CompanyForm", () => import("./pages/companies/CompanyForm"));

// Lazy load WhatsApp Template pages
const TemplatesList = lazyWithRetry("TemplatesList", () => import("./pages/whatsapp/TemplatesList"));
const TemplateForm = lazyWithRetry("TemplateForm", () => import("./pages/whatsapp/TemplateForm"));
const TemplateDetail = lazyWithRetry("TemplateDetail", () => import("./pages/whatsapp/TemplateDetail"));

// Lazy load Admin pages
const AdminLogin = lazyWithRetry("AdminLogin", () => import("./pages/admin/AdminLogin"));
const AdminMFASetup = lazyWithRetry("AdminMFASetup", () => import("./pages/admin/AdminMFASetup"));
const AdminDashboard = lazyWithRetry("AdminDashboard", () => import("./pages/admin/AdminDashboard"));
const AdminOrganizations = lazyWithRetry("AdminOrganizations", () => import("./pages/admin/AdminOrganizations"));
const AdminOrganizationDetail = lazyWithRetry("AdminOrganizationDetail", () => import("./pages/admin/AdminOrganizationDetail"));
const AdminUsers = lazyWithRetry("AdminUsers", () => import("./pages/admin/AdminUsers"));
const AdminFeatureFlags = lazyWithRetry("AdminFeatureFlags", () => import("./pages/admin/AdminFeatureFlags"));
const AdminLogs = lazyWithRetry("AdminLogs", () => import("./pages/admin/AdminLogs"));
const AdminSecurity = lazyWithRetry("AdminSecurity", () => import("./pages/admin/AdminSecurity"));
const AdminImpersonationHistory = lazyWithRetry("AdminImpersonationHistory", () => import("./pages/admin/AdminImpersonationHistory"));
const AdminPlans = lazyWithRetry("AdminPlans", () => import("./pages/admin/AdminPlans"));
const AdminCoupons = lazyWithRetry("AdminCoupons", () => import("./pages/admin/AdminCoupons"));
const AdminIntegrations = lazyWithRetry("AdminIntegrations", () => import("./pages/admin/AdminIntegrations"));
const AdminIntegrationDetail = lazyWithRetry("AdminIntegrationDetail", () => import("./pages/admin/AdminIntegrationDetail"));
const AdminDocumentation = lazyWithRetry("AdminDocumentation", () => import("./pages/admin/AdminDocumentation"));
const AdminIntegrationHealth = lazyWithRetry("AdminIntegrationHealth", () => import("./pages/admin/AdminIntegrationHealth"));
const AdminDocumentationEdit = lazyWithRetry("AdminDocumentationEdit", () => import("./pages/admin/AdminDocumentationEdit"));
const ObservabilityPage = lazyWithRetry("ObservabilityPage", () => import("./pages/admin/ObservabilityPage"));
const AdminProtectedRoute = lazyWithRetry("AdminProtectedRoute", () => import("./components/admin/AdminProtectedRoute"), "AdminProtectedRoute");
const ImpersonateCallback = lazyWithRetry("ImpersonateCallback", () => import("./pages/admin/ImpersonateCallback"));
const AdminEvolution = lazyWithRetry("AdminEvolution", () => import("./pages/admin/AdminEvolution"));


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
    <CallHandlersBoundary>
      <Suspense fallback={null}>
        <InboundCallHandler />
        <OutboundCallHandler />
      </Suspense>
    </CallHandlersBoundary>
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

  // Idioma inicial da home: preferência salva → país do IP → navigator → default.
  const [locale, setLocale] = useState<Locale | null>(null);
  useEffect(() => {
    if (hasImp) return;
    let active = true;
    resolveInitialLocale()
      .then((l) => { if (active) setLocale(l); })
      .catch(() => { if (active) setLocale(detectLocale()); });
    return () => { active = false; };
  }, [hasImp]);

  if (hasImp) {
    window.location.replace('/impersonate/callback' + search + hash);
    return null;
  }
  if (!locale) return <PageLoader />;
  return <Navigate to={`/${LOCALE_TO_SLUG[locale]}`} replace />;
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
        <TelephonyProvider>
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
          <Route
            path="/suporte"
            element={<SiteI18nProvider><SupportPage /></SiteI18nProvider>}
          />
          <Route
            path="/:locale/support"
            element={
              <LocaleGuard>
                <SiteI18nProvider>
                  <SupportPage />
                </SiteI18nProvider>
              </LocaleGuard>
            }
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
          <Route path="/marketing/organic" element={<ProtectedRoute><MarketingOrganic /></ProtectedRoute>} />
          <Route path="/marketing/funnel" element={<ProtectedRoute><MarketingFunnel /></ProtectedRoute>} />
          <Route path="/marketing/timeline" element={<ProtectedRoute><MarketingTimeline /></ProtectedRoute>} />
          <Route path="/marketing/posts" element={<ProtectedRoute><MarketingPosts /></ProtectedRoute>} />
          <Route path="/marketing/comments" element={<ProtectedRoute><MarketingComments /></ProtectedRoute>} />
          <Route path="/marketing/webhooks" element={<ProtectedRoute><MarketingWebhooks /></ProtectedRoute>} />
          <Route path="/marketing/campaigns" element={<ProtectedRoute><MarketingCampaigns /></ProtectedRoute>} />
          <Route path="/social" element={<ProtectedRoute><SocialInboxPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsLayout /></ProtectedRoute>}>
            <Route index element={<SettingsGrid />} />
            <Route path="general" element={<GeneralSettings />} />
            <Route path="theme" element={<ThemeSettings />} />
            <Route path="users" element={<UsersSettings />} />
            <Route path="permissions" element={<PermissionProfilesSettings />} />
            <Route path="billing" element={<BillingSettings />} />
            <Route path="pipeline" element={<PipelineSettings />} />
            <Route path="opportunity-close" element={<OpportunityCloseSettings />} />
            <Route path="duplicates" element={<DuplicatePreventionSettings />} />
            <Route path="custom-fields" element={<CustomFieldsSettings />} />
            <Route path="tags" element={<TagsSettings />} />
            <Route path="documents" element={<DocumentsSettings />} />
            <Route path="integrations" element={<IntegrationsSettings />} />
            <Route path="whatsapp-comercial" element={<SalesWhatsAppPage />} />
            <Route path="integrations/meta" element={<MetaIntegrationPage />} />
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
        </TelephonyProvider>
        </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
