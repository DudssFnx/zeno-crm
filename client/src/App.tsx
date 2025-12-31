import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { LoadingPage } from "@/components/loading-spinner";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import InboxPage from "@/pages/dashboard";
import UsersPage from "@/pages/settings/users";
import AccountsPage from "@/pages/settings/accounts";
import TagsPage from "@/pages/settings/tags";
import WebhooksPage from "@/pages/settings/webhooks";
import CannedResponsesPage from "@/pages/settings/canned-responses";
import ContactsPage from "@/pages/settings/contacts";
import KanbanPage from "@/pages/kanban";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.role !== "admin" && user.role !== "master") {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (user) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/">
        <ProtectedRoute component={InboxPage} />
      </Route>
      <Route path="/settings/users">
        <AdminRoute component={UsersPage} />
      </Route>
      <Route path="/settings/accounts">
        <ProtectedRoute component={AccountsPage} />
      </Route>
      <Route path="/settings/tags">
        <ProtectedRoute component={TagsPage} />
      </Route>
      <Route path="/settings/webhooks">
        <ProtectedRoute component={WebhooksPage} />
      </Route>
      <Route path="/settings/canned-responses">
        <ProtectedRoute component={CannedResponsesPage} />
      </Route>
      <Route path="/contacts">
        <ProtectedRoute component={ContactsPage} />
      </Route>
      <Route path="/kanban">
        <ProtectedRoute component={KanbanPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
