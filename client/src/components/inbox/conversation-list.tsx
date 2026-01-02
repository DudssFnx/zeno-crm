import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, MessageSquare, Trash2, X, UserCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { cn, formatPhoneNumber } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConversationWithDetails, WhatsappAccount, User, Tag } from "@shared/schema";
import { useAuth } from "@/lib/auth";

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string;
}

export function ConversationList({ selectedId, onSelect, currentUserId }: ConversationListProps) {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const isOperator = user?.role === "operator";
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/conversations/bulk", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Conversas apagadas",
        description: `${data.deleted} conversa(s) removida(s) com sucesso.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSelectedConversations(new Set());
      setSelectionMode(false);
      if (selectedConversations.has(selectedId || "")) {
        onSelect("");
      }
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao apagar conversas.",
        variant: "destructive",
      });
    },
  });

  const toggleSelection = (id: string) => {
    setSelectedConversations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedConversations(new Set());
  };

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
    refetchInterval: 5000,
    staleTime: 2000,
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
            className="pl-10 bg-background min-h-[44px]"
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

          {!isOperator && (
            <Button 
              variant={selectionMode ? "secondary" : "ghost"} 
              size="icon"
              onClick={() => selectionMode ? cancelSelection() : setSelectionMode(true)}
              disabled={conversations.length === 0}
              className="min-h-[44px] min-w-[44px]"
              data-testid="button-toggle-selection-mode"
            >
              {selectionMode ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {selectionMode && (
          <div className="flex items-center justify-between gap-2 p-2 bg-muted rounded-md">
            <span className="text-sm text-muted-foreground">
              {selectedConversations.size} selecionada(s)
            </span>
            <Button 
              variant="destructive" 
              size="sm"
              disabled={selectedConversations.size === 0 || deleteMutation.isPending}
              onClick={() => setShowDeleteDialog(true)}
              data-testid="button-delete-selected"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {deleteMutation.isPending ? "Apagando..." : "Apagar"}
            </Button>
          </div>
        )}

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar conversas selecionadas?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá remover permanentemente {selectedConversations.size} conversa(s) e todas as mensagens associadas. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  deleteMutation.mutate(Array.from(selectedConversations));
                  setShowDeleteDialog(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Apagar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
              <div
                key={conv.id}
                className={cn(
                  "w-full text-left p-3 hover-elevate transition-colors cursor-pointer min-h-[72px] active:bg-sidebar-accent/50",
                  selectedId === conv.id && "bg-sidebar-accent border-l-2 border-l-primary"
                )}
                onClick={() => selectionMode ? toggleSelection(conv.id) : onSelect(conv.id)}
                data-testid={`conversation-item-${conv.id}`}
              >
                <div className="flex gap-3">
                  {selectionMode && (
                    <div className="flex items-center">
                      <Checkbox
                        checked={selectedConversations.has(conv.id)}
                        onCheckedChange={() => toggleSelection(conv.id)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`checkbox-conversation-${conv.id}`}
                      />
                    </div>
                  )}
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
                        {formatPhoneNumber(conv.contact.phoneNumber)}
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
                      {conv.contact.attribute && (
                        <Badge 
                          variant="outline" 
                          className="text-[10px] px-1.5 py-0 h-5 border-orange-500/50 text-orange-600 dark:text-orange-400 bg-transparent"
                          data-testid={`badge-attribute-${conv.id}`}
                        >
                          <UserCircle className="h-3 w-3 mr-0.5" />
                          {conv.contact.attribute}
                        </Badge>
                      )}
                      {conv.tags && conv.tags.slice(0, 2).map((tag) => (
                        <TagChip key={tag.id} tag={tag} size="sm" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
