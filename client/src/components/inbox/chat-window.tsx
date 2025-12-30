import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, StickyNote, Phone, MoreVertical, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { StatusBadge } from "@/components/status-badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ConversationWithDetails, MessageWithSender, User } from "@shared/schema";

interface ChatWindowProps {
  conversationId: string | null;
  onContactClick: () => void;
}

export function ChatWindow({ conversationId, onContactClick }: ChatWindowProps) {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversation, isLoading: convLoading } = useQuery<ConversationWithDetails>({
    queryKey: ["/api/conversations", conversationId],
    queryFn: async () => {
      const res = await authFetch(`/api/conversations/${conversationId}`);
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!conversationId,
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    queryFn: async () => {
      const res = await authFetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!conversationId,
  });

  const { data: agents = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await authFetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (data: { content: string; isInternalNote: boolean }) => {
      const endpoint = data.isInternalNote
        ? `/api/conversations/${conversationId}/internal-notes`
        : `/api/conversations/${conversationId}/messages`;
      const res = await authFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ content: data.content }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Falha ao enviar mensagem" }));
        throw new Error(error.message || "Falha ao enviar mensagem");
      }
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao enviar mensagem", variant: "destructive" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await authFetch(`/api/conversations/${conversationId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const assignAgent = useMutation({
    mutationFn: async (userId: string | null) => {
      const res = await authFetch(`/api/conversations/${conversationId}/assign`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to assign agent");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage.mutate({ content: message.trim(), isInternalNote });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  const groupMessagesByDate = (msgs: MessageWithSender[]) => {
    const groups: { date: string; messages: MessageWithSender[] }[] = [];
    let currentDate = "";

    msgs.forEach((msg) => {
      const dateStr = new Date(msg.createdAt).toDateString();
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({ date: dateStr, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <EmptyState
          icon={Phone}
          title="Selecione uma conversa"
          description="Escolha uma conversa da lista para começar a conversar"
        />
      </div>
    );
  }

  if (convLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={Phone}
          title="Conversa não encontrada"
          description="Esta conversa pode ter sido excluída"
        />
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="h-14 border-b flex items-center justify-between gap-4 px-4 shrink-0">
        <button
          onClick={onContactClick}
          className="flex items-center gap-3 hover-elevate rounded-lg p-1 -ml-1"
          data-testid="button-contact-details"
        >
          <AvatarWithFallback
            name={conversation.contact.name}
            src={conversation.contact.avatarUrl}
            size="md"
          />
          <div className="text-left">
            <div className="font-medium text-[15px]">{conversation.contact.name}</div>
            <div className="text-xs text-muted-foreground">{conversation.contact.phoneNumber}</div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <Select
            value={conversation.status}
            onValueChange={(status) => updateStatus.mutate(status)}
          >
            <SelectTrigger className="w-[130px]" data-testid="select-conversation-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
              <SelectItem value="closed">Fechado</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={conversation.assignedToUserId || "unassigned"}
            onValueChange={(v) => assignAgent.mutate(v === "unassigned" ? null : v)}
          >
            <SelectTrigger className="w-[150px]" data-testid="select-assign-agent">
              <SelectValue placeholder="Atribuir para..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Não atribuído</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {msgsLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={Phone}
            title="Nenhuma mensagem ainda"
            description="Inicie a conversa enviando uma mensagem"
            className="h-full"
          />
        ) : (
          <div className="space-y-6">
            {messageGroups.map((group) => (
              <div key={group.date}>
                <div className="flex justify-center mb-4">
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                    {formatDate(group.date)}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === "outgoing" && "justify-end",
                        msg.direction === "internal_note" && "justify-center"
                      )}
                    >
                      {msg.direction === "internal_note" ? (
                        <div className="max-w-lg bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-2">
                          <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400 mb-1">
                            <StickyNote className="h-3 w-3" />
                            <span>Nota Interna</span>
                            {msg.sender && <span>por {msg.sender.name}</span>}
                          </div>
                          <p className="text-sm text-yellow-800 dark:text-yellow-300">{msg.content}</p>
                          <span className="text-[11px] text-yellow-600 dark:text-yellow-500 mt-1 block">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "max-w-[65%] rounded-2xl px-4 py-2",
                            msg.direction === "incoming"
                              ? "bg-muted rounded-bl-md"
                              : "bg-primary text-primary-foreground rounded-br-md"
                          )}
                        >
                          {msg.direction === "outgoing" && msg.senderDisplayName && (
                            <p className="text-[11px] font-medium text-primary-foreground/80 mb-0.5">
                              {msg.senderDisplayName}
                            </p>
                          )}
                          <p className="text-[15px] whitespace-pre-wrap break-words">{msg.content}</p>
                          <span
                            className={cn(
                              "text-[11px] mt-1 block",
                              msg.direction === "incoming"
                                ? "text-muted-foreground"
                                : "text-primary-foreground/70"
                            )}
                          >
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <footer className="border-t p-4 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant={isInternalNote ? "default" : "outline"}
                size="sm"
                onClick={() => setIsInternalNote(!isInternalNote)}
                data-testid="button-toggle-internal-note"
              >
                <StickyNote className="h-4 w-4 mr-1" />
                Nota Interna
              </Button>
              {isInternalNote && (
                <span className="text-xs text-muted-foreground">
                  Esta nota é visível apenas para sua equipe
                </span>
              )}
            </div>
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isInternalNote ? "Escreva uma nota interna..." : "Digite uma mensagem..."}
              className={cn(
                "min-h-[48px] max-h-32 resize-none",
                isInternalNote && "border-yellow-400 dark:border-yellow-600"
              )}
              data-testid="textarea-message"
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMessage.isPending}
            data-testid="button-send-message"
          >
            {sendMessage.isPending ? (
              <LoadingSpinner size="sm" className="text-primary-foreground" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
