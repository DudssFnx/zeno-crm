import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  MessageSquare,
  Users,
  Smartphone,
  Tag,
  Webhook,
  Settings,
  LogOut,
  Menu,
  Contact,
  LayoutGrid,
  Zap,
  PlaySquare,
  Columns,
  ArrowLeft,
  X,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ChatWindow } from "@/components/inbox/chat-window";
import { ContactDetails } from "@/components/inbox/contact-details";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/hooks/use-realtime";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: MessageSquare, label: "Atendimentos", path: "/" },
  { icon: Contact, label: "Contatos", path: "/contacts" },
  { icon: LayoutGrid, label: "Kanban", path: "/kanban" },
  { icon: Users, label: "Usuários", path: "/settings/users", adminOnly: true },
  { icon: Smartphone, label: "Contas WhatsApp", path: "/settings/accounts", operatorHidden: true },
  { icon: Tag, label: "Etiquetas", path: "/settings/tags", operatorHidden: true },
  { icon: Star, label: "Atributos", path: "/settings/attributes", operatorHidden: true },
  { icon: Columns, label: "Estágios", path: "/settings/stages", operatorHidden: true },
  { icon: Zap, label: "Respostas Rápidas", path: "/settings/canned-responses" },
  { icon: PlaySquare, label: "Macros", path: "/settings/macros" },
  { icon: Webhook, label: "Webhooks", path: "/settings/webhooks", operatorHidden: true },
  { icon: Settings, label: "Meu Perfil", path: "/settings/profile" },
];

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

function MobileNavSheet({ user, isAdmin, isOperator, location, logout }: { 
  user: { name: string; email: string; role: string };
  isAdmin: boolean;
  isOperator: boolean;
  location: string;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden min-h-[44px] min-w-[44px]" data-testid="button-mobile-nav">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex flex-col h-full bg-sidebar">
          <div className="p-4 border-b">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <MessageSquare className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <nav className="p-2 space-y-1">
              {navItems.map((item) => {
                if (item.adminOnly && !isAdmin) return null;
                if ((item as any).operatorHidden && isOperator) return null;
                const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
                return (
                  <Link key={item.path} href={item.path} onClick={() => setOpen(false)}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 min-h-[44px]",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
          <div className="p-4 border-t">
            <div className="flex items-center gap-3 mb-3">
              <AvatarWithFallback name={user.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={logout} className="min-h-[44px] min-w-[44px]">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  
  useRealtime();

  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "master";
  const isOperator = user.role === "operator";

  return (
    <div className="flex h-screen bg-background">
      <aside className={cn(
        "w-16 border-r flex-col items-center py-4 bg-sidebar shrink-0",
        "hidden md:flex"
      )}>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary mb-6">
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            if ((item as any).operatorHidden && isOperator) return null;
            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "w-10 h-10",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                  title={item.label}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <item.icon className="h-5 w-5" />
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-10 h-10" data-testid="button-user-menu">
                <AvatarWithFallback name={user.name} size="sm" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-56">
              <div className="p-2">
                <p className="font-medium text-sm">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {isMobile && (
          <header className="h-14 border-b flex items-center px-3 gap-3 shrink-0 md:hidden">
            <MobileNavSheet user={user} isAdmin={isAdmin} isOperator={isOperator} location={location} logout={logout} />
            <h1 className="font-semibold flex-1">WhatsApp CRM</h1>
            <ThemeToggle />
          </header>
        )}
        <div className="flex-1 flex min-w-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

type MobileView = 'list' | 'chat' | 'details';

export default function InboxPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('list');

  if (!user) return null;

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setShowContactDetails(false);
    if (isMobile) {
      setMobileView('chat');
    }
  };

  const handleBackToList = () => {
    setMobileView('list');
    setShowContactDetails(false);
  };

  const handleShowContactDetails = () => {
    setShowContactDetails(true);
    if (isMobile) {
      setMobileView('details');
    }
  };

  const handleCloseContactDetails = () => {
    setShowContactDetails(false);
    if (isMobile) {
      setMobileView('chat');
    }
  };

  if (isMobile) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {mobileView === 'list' && (
            <div className="flex-1 overflow-hidden">
              <ConversationList
                selectedId={selectedConversationId}
                onSelect={handleSelectConversation}
                currentUserId={user.id}
              />
            </div>
          )}

          {mobileView === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <ChatWindow
                conversationId={selectedConversationId}
                onContactClick={handleShowContactDetails}
                onBack={handleBackToList}
                isMobile={true}
              />
            </div>
          )}

          {mobileView === 'details' && selectedConversationId && (
            <div className="flex-1 overflow-hidden">
              <ContactDetails
                conversationId={selectedConversationId}
                onClose={handleCloseContactDetails}
                isMobile={true}
              />
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className={cn(
        "shrink-0",
        isTablet ? "w-72" : "w-80"
      )}>
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          currentUserId={user.id}
        />
      </div>

      <ChatWindow
        conversationId={selectedConversationId}
        onContactClick={handleShowContactDetails}
      />

      {showContactDetails && selectedConversationId && (
        <>
          {isTablet ? (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={handleCloseContactDetails}>
              <div 
                className="fixed right-0 top-0 h-full w-80 bg-background border-l shadow-lg animate-in slide-in-from-right"
                onClick={(e) => e.stopPropagation()}
              >
                <ContactDetails
                  conversationId={selectedConversationId}
                  onClose={handleCloseContactDetails}
                />
              </div>
            </div>
          ) : (
            <ContactDetails
              conversationId={selectedConversationId}
              onClose={handleCloseContactDetails}
            />
          )}
        </>
      )}
    </DashboardLayout>
  );
}
