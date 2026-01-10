import { apiRequest } from "@/lib/queryClient";
import {
  Bot,
  Building2,
  CalendarClock,
  Contact,
  Database,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  PlaySquare,
  Settings,
  Shield,
  Smartphone,
  Star,
  Tag,
  Users,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { ChatWindow } from "@/components/inbox/chat-window";
import { ContactDetails } from "@/components/inbox/contact-details";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ThemeToggle } from "@/components/theme-toggle";

import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { useRealtime } from "@/hooks/use-realtime";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Logo vindo do public/
 * NÃO usar import de imagem
 */
const LOGO_SRC = "/login-bg.png";

const navItems = [
  { icon: MessageSquare, label: "Atendimentos", path: "/" },
  { icon: Contact, label: "Contatos", path: "/contacts" },
  { icon: MapPin, label: "Mapa Clientes", path: "/clients-map" },
  { icon: LayoutGrid, label: "Kanban", path: "/kanban" },
];

const settingsItems = [
  { icon: Users, label: "Usuários", path: "/settings/users", adminOnly: true },
  { icon: Smartphone, label: "Contas WhatsApp", path: "/settings/accounts", adminOnly: true },
  { icon: Tag, label: "Etiquetas", path: "/settings/tags", adminOnly: true },
  { icon: Star, label: "Atributos", path: "/settings/attributes", adminOnly: true },
  { icon: Zap, label: "Respostas Rápidas", path: "/settings/canned-responses", adminOnly: true },
  { icon: PlaySquare, label: "Macros", path: "/settings/macros", adminOnly: true },
  { icon: Bot, label: "Robôs", path: "/settings/robots", adminOnly: true },
  { icon: Shield, label: "Fila Anti-Spam", path: "/settings/robot-queue", adminOnly: true },
  { icon: Workflow, label: "Automação", path: "/settings/automation", adminOnly: true },
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

function MobileNavSheet({
  user,
  isAdmin,
  location,
  logout,
}: {
  user: { name: string; email: string; role: string };
  isAdmin: boolean;
  location: string;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);

  const visibleSettingsItems = settingsItems.filter(
    (item) => !(item.adminOnly && !isAdmin)
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-64 p-0">
        <div className="flex flex-col h-full bg-sidebar">
          <div className="p-4 border-b">
            <img src={LOGO_SRC} alt="Zeno CRM" className="h-10 w-auto rounded-md" />
          </div>

          <ScrollArea className="flex-1">
            <nav className="p-2 space-y-1">
              {navItems.map((item) => {
                const active =
                  location === item.path ||
                  (item.path !== "/" && location.startsWith(item.path));

                return (
                  <Link key={item.path} href={item.path} onClick={() => setOpen(false)}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3",
                        active && "bg-sidebar-accent"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}

              <Separator className="my-2" />

              {visibleSettingsItems.map((item) => (
                <Link key={item.path} href={item.path} onClick={() => setOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-3">
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Button>
                </Link>
              ))}
            </nav>
          </ScrollArea>

          <div className="p-4 border-t">
            <div className="flex items-center gap-3 mb-3">
              <AvatarWithFallback name={user.name} size="sm" />
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <Button variant="ghost" onClick={logout} className="w-full justify-start gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
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

  return (
    <div className="flex h-screen">
      {!isMobile && (
        <aside className="w-16 border-r flex flex-col items-center py-4 bg-sidebar">
          <img src={LOGO_SRC} alt="Zeno CRM" className="h-10 w-10 rounded-md mb-6" />

          <nav className="flex flex-col gap-2 flex-1">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <Button variant="ghost" size="icon">
                  <item.icon className="h-5 w-5" />
                </Button>
              </Link>
            ))}
          </nav>

          <ThemeToggle />

          <Button variant="ghost" size="icon" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </aside>
      )}

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

export default function InboxPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showContactDetails, setShowContactDetails] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get("conversation");
    if (conversationId) {
      setSelectedConversationId(conversationId);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  if (!user) return null;

  const handleSelectConversation = useCallback(async (id: string) => {
    setSelectedConversationId(id);
    setShowContactDetails(false);
    try {
      await apiRequest("POST", `/api/conversations/${id}/open`);
    } catch {}
  }, []);

  return (
    <DashboardLayout>
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={25}>
          <ConversationList
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            currentUserId={user.id}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={50}>
          <ChatWindow
            conversationId={selectedConversationId}
            onContactClick={() => setShowContactDetails(true)}
          />
        </ResizablePanel>

        {showContactDetails && selectedConversationId && !isTablet && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={25}>
              <ContactDetails
                conversationId={selectedConversationId}
                onClose={() => setShowContactDetails(false)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </DashboardLayout>
  );
}
