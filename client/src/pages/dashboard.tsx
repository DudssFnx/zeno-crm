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
import { ConversationList } from "@/components/inbox/conversation-list";
import { ChatWindow } from "@/components/inbox/chat-window";
import { ContactDetails } from "@/components/inbox/contact-details";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: MessageSquare, label: "Atendimentos", path: "/" },
  { icon: Contact, label: "Contatos", path: "/contacts" },
  { icon: LayoutGrid, label: "Kanban", path: "/kanban" },
  { icon: Users, label: "Usuários", path: "/settings/users", adminOnly: true },
  { icon: Smartphone, label: "Contas WhatsApp", path: "/settings/accounts" },
  { icon: Tag, label: "Etiquetas", path: "/settings/tags" },
  { icon: Columns, label: "Estágios", path: "/settings/stages" },
  { icon: Zap, label: "Respostas Rápidas", path: "/settings/canned-responses" },
  { icon: PlaySquare, label: "Macros", path: "/settings/macros" },
  { icon: Webhook, label: "Webhooks", path: "/settings/webhooks" },
  { icon: Settings, label: "Meu Perfil", path: "/settings/profile" },
];

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  
  useRealtime();

  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "master";

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-16 border-r flex flex-col items-center py-4 bg-sidebar shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary mb-6">
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
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

      <div className="flex-1 flex min-w-0">{children}</div>
    </div>
  );
}

export default function InboxPage() {
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showContactDetails, setShowContactDetails] = useState(false);

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="w-80 shrink-0">
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={(id) => {
            setSelectedConversationId(id);
            setShowContactDetails(false);
          }}
          currentUserId={user.id}
        />
      </div>

      <ChatWindow
        conversationId={selectedConversationId}
        onContactClick={() => setShowContactDetails(true)}
      />

      {showContactDetails && selectedConversationId && (
        <ContactDetails
          conversationId={selectedConversationId}
          onClose={() => setShowContactDetails(false)}
        />
      )}
    </DashboardLayout>
  );
}
