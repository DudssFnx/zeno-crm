import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { ConversationWithDetails, WhatsappAccount, User, Tag } from "@shared/schema";

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string;
}

export function ConversationList({ selectedId, onSelect, currentUserId }: ConversationListProps) {
  const authFetch = useAuthFetch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  const { data: conversations = [], isLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/conversations", statusFilter, accountFilter, assigneeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (accountFilter !== "all") params.set("whatsappAccountId", accountFilter);
      if (assigneeFilter === "mine") params.set("assignedToUserId", currentUserId);
      const res = await authFetch(`/api/conversations?${params}`);
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  const { data: accounts = [] } = useQuery<WhatsappAccount[]>({
    queryKey: ["/api/whatsapp-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/whatsapp-accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  const filteredConversations = conversations.filter((conv) => {
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesSearch = conv.contact.name.toLowerCase().includes(searchLower) ||
        conv.contact.phoneNumber.includes(search);
      if (!matchesSearch) return false;
    }
    
    if (tagFilter !== "all") {
      const hasTag = conv.tags?.some(t => t.id === tagFilter);
      if (!hasTag) return false;
    }
    
    return true;
  });

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "Ontem";
    } else if (days < 7) {
      return d.toLocaleDateString("pt-BR", { weekday: "short" });
    } else {
      return d.toLocaleDateString("pt-BR", { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="flex flex-col h-full border-r bg-sidebar">
      <div className="p-3 space-y-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background"
            data-testid="input-search-conversations"
          />
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 min-w-[100px]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
              <SelectItem value="closed">Fechado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="flex-1 min-w-[100px]" data-testid="select-account-filter">
              <SelectValue placeholder="Conta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Contas</SelectItem>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="flex-1 min-w-[100px]" data-testid="select-assignee-filter">
              <SelectValue placeholder="Atribuído" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Conversas</SelectItem>
              <SelectItem value="mine">Minhas Conversas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="flex-1 min-w-[100px]" data-testid="select-tag-filter">
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Etiquetas</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : filteredConversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Sem conversas"
            description="As conversas aparecerão aqui quando os clientes enviarem mensagens"
          />
        ) : (
          <div className="divide-y">
            {filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "w-full text-left p-3 hover-elevate transition-colors",
                  selectedId === conv.id && "bg-sidebar-accent border-l-2 border-l-primary"
                )}
                data-testid={`conversation-item-${conv.id}`}
              >
                <div className="flex gap-3">
                  <AvatarWithFallback
                    name={conv.contact.name}
                    src={conv.contact.avatarUrl}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-medium text-[15px] truncate">
                        {conv.contact.name}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground truncate">
                        {conv.contact.phoneNumber}
                      </span>
                      {conv.assignedToUserId === currentUserId && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" title="Atribuído a você" />
                      )}
                    </div>
                    {conv.lastMessage && (
                      <p className="text-sm text-muted-foreground truncate">
                        {conv.lastMessage.direction === "outgoing" && "Você: "}
                        {conv.lastMessage.content}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <StatusBadge status={conv.status as "open" | "pending" | "resolved" | "closed"} />
                      {conv.tags && conv.tags.slice(0, 2).map((tag) => (
                        <TagChip key={tag.id} tag={tag} size="sm" />
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
