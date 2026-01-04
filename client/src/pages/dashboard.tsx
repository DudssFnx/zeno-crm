import { useState, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import {
  MessageSquare,
  MessageCircle,
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
  ArrowLeft,
  X,
  Star,
  GripVertical,
  Bot,
  Workflow,
  CalendarClock,
  Database,
  Building2,
} from "lucide-react";
import zenoLogo from "@assets/image_1767464880710.png";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
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
];

const settingsItems = [
  { icon: Users, label: "Usuários", path: "/settings/users", adminOnly: true },
  { icon: Smartphone, label: "Contas WhatsApp", path: "/settings/accounts", adminOnly: true },
  { icon: Tag, label: "Etiquetas", path: "/settings/tags", adminOnly: true },
  { icon: Star, label: "Atributos", path: "/settings/attributes", adminOnly: true },
  { icon: Zap, label: "Respostas Rápidas", path: "/settings/canned-responses", adminOnly: true },
  { icon: PlaySquare, label: "Macros", path: "/settings/macros", adminOnly: true },
  { icon: Bot, label: "Robos", path: "/settings/robots", adminOnly: true },
  { icon: Workflow, label: "Automacao", path: "/settings/automation", adminOnly: true },
  { icon: CalendarClock, label: "Agendador", path: "/settings/scheduler" },
  { icon: Webhook, label: "Webhooks", path: "/settings/webhooks", adminOnly: true },
  { icon: Database, label: "Backup", path: "/settings/backup", adminOnly: true },
  { icon: Settings, label: "Meu Perfil", path: "/settings/profile" },
];

const masterItems = [
  { icon: Building2, label: "Empresas", path: "/master/companies" },
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

  const visibleSettingsItems = settingsItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden min-h-[44px] min-w-[44px]" data-testid="button-mobile-nav">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 flex flex-col">
        <div className="flex flex-col h-full bg-sidebar overflow-hidden">
          <div className="p-4 border-b shrink-0">
            <img src={zenoLogo} alt="Zeno" className="h-10 w-10 rounded-lg object-cover" />
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <nav className="p-2 space-y-1 pb-4">
              {navItems.map((item) => {
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
              
              {visibleSettingsItems.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
                    {isAdmin ? "Configurações" : "Minha Conta"}
                  </p>
                  {visibleSettingsItems.map((item) => {
                    const isActive = location === item.path;
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
                </>
              )}

              {user.role === "master" && (
                <>
                  <Separator className="my-2" />
                  <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
                    Painel Master
                  </p>
                  {masterItems.map((item) => {
                    const isActive = location === item.path || location.startsWith(item.path);
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
                </>
              )}
            </nav>
          </div>
          <div className="p-4 border-t shrink-0">
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

  const visibleSettingsItems = settingsItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <div className="flex h-screen bg-background">
      <aside className={cn(
        "w-16 border-r flex-col items-center py-4 bg-sidebar shrink-0",
        "hidden md:flex"
      )}>
        <img src={zenoLogo} alt="Zeno" className="h-10 w-10 rounded-lg object-cover mb-6" />

        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map((item) => {
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
          
          <Separator className="my-1" />
          
          {visibleSettingsItems.map((item) => {
            const isActive = location === item.path;
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

          {user.role === "master" && (
            <>
              <Separator className="my-1" />
              {masterItems.map((item) => {
                const isActive = location === item.path || location.startsWith(item.path);
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
                      data-testid={`nav-master-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="h-5 w-5" />
                    </Button>
                  </Link>
                );
              })}
            </>
          )}
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get('conversation');
    if (conversationId) {
      setSelectedConversationId(conversationId);
      if (isMobile) {
        setMobileView('chat');
      }
      window.history.replaceState({}, '', '/');
    }
  }, [isMobile]);

  if (!user) return null;

  const handleSelectConversation = useCallback(async (id: string) => {
    setSelectedConversationId(id);
    setShowContactDetails(false);
    if (isMobile) {
      setMobileView('chat');
    }
    
    // Mark conversation as opened (pending -> open)
    try {
      await apiRequest("POST", `/api/conversations/${id}/open`);
    } catch (error) {
      console.error("Failed to mark conversation as open:", error);
    }
  }, [isMobile]);

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
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel 
          id="conversation-list"
          order={1}
          defaultSize={25} 
          minSize={15} 
          maxSize={40}
          className="min-w-[200px]"
        >
          <ConversationList
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            currentUserId={user.id}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel 
          id="chat-window"
          order={2}
          defaultSize={showContactDetails ? 50 : 75} 
          minSize={30}
        >
          <ChatWindow
            conversationId={selectedConversationId}
            onContactClick={handleShowContactDetails}
          />
        </ResizablePanel>

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
              <>
                <ResizableHandle withHandle />
                <ResizablePanel 
                  id="contact-details"
                  order={3}
                  defaultSize={25} 
                  minSize={15} 
                  maxSize={35}
                >
                  <ContactDetails
                    conversationId={selectedConversationId}
                    onClose={handleCloseContactDetails}
                  />
                </ResizablePanel>
              </>
            )}
          </>
        )}
      </ResizablePanelGroup>
    </DashboardLayout>
  );
}
