import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, StickyNote, Phone, Check, CheckCheck, Zap, Paperclip, UserPlus, Calendar, X, FileIcon, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ConversationWithDetails, MessageWithSender, User, CannedResponse } from "@shared/schema";

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
  const [showCannedResponses, setShowCannedResponses] = useState(false);
  const [cannedSearchTerm, setCannedSearchTerm] = useState("");
  const [selectedCannedIndex, setSelectedCannedIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cannedDropdownRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const { data: agents = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await authFetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const { data: cannedResponses = [] } = useQuery<CannedResponse[]>({
    queryKey: ["/api/canned-responses"],
    queryFn: async () => {
      const res = await authFetch("/api/canned-responses");
      if (!res.ok) throw new Error("Failed to fetch canned responses");
      return res.json();
    },
  });

  const filteredCannedResponses = useMemo(() => {
    if (!cannedSearchTerm) return cannedResponses;
    const searchLower = cannedSearchTerm.toLowerCase();
    return cannedResponses.filter(
      (r) =>
        r.shortcut.toLowerCase().includes(searchLower) ||
        r.content.toLowerCase().includes(searchLower)
    );
  }, [cannedResponses, cannedSearchTerm]);

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
      setIsTyping(false);
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

  useEffect(() => {
    setSelectedCannedIndex(0);
  }, [filteredCannedResponses]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cannedDropdownRef.current &&
        !cannedDropdownRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowCannedResponses(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMessageChange = (value: string) => {
    setMessage(value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    if (value.trim()) {
      setIsTyping(true);
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 2000);
    } else {
      setIsTyping(false);
    }

    if (value.startsWith("/")) {
      const searchTerm = value.slice(1);
      setCannedSearchTerm(searchTerm);
      setShowCannedResponses(true);
    } else {
      setShowCannedResponses(false);
      setCannedSearchTerm("");
    }
  };

  const selectCannedResponse = (response: CannedResponse) => {
    setMessage(response.content);
    setShowCannedResponses(false);
    setCannedSearchTerm("");
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage.mutate({ content: message.trim(), isInternalNote });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCannedResponses && filteredCannedResponses.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCannedIndex((prev) =>
          prev < filteredCannedResponses.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCannedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCannedResponses.length - 1
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        selectCannedResponse(filteredCannedResponses[selectedCannedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCannedResponses(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande (max 50MB)", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    <div 
      className="flex-1 flex flex-col min-w-0 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center">
          <div className="bg-background p-6 rounded-lg shadow-lg text-center">
            <Paperclip className="h-12 w-12 mx-auto mb-2 text-primary" />
            <p className="text-lg font-medium">Solte o arquivo aqui</p>
            <p className="text-sm text-muted-foreground">para anexar à mensagem</p>
          </div>
        </div>
      )}
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
                        <div className="max-w-lg bg-amber-50 dark:bg-amber-950/40 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-lg px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                            <StickyNote className="h-4 w-4" />
                            <span>Nota Interna</span>
                            {msg.sender && (
                              <span className="ml-auto text-amber-600 dark:text-amber-500">
                                {msg.sender.name}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                            {msg.content}
                          </p>
                          <span className="text-[11px] text-amber-600 dark:text-amber-500 mt-2 block">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "max-w-[65%] rounded-2xl px-4 py-2 shadow-sm",
                            msg.direction === "incoming"
                              ? "rounded-bl-md"
                              : "rounded-br-md"
                          )}
                          style={{
                            backgroundColor: msg.direction === "incoming" ? "#c4ffd0" : "#008f3c",
                            color: msg.direction === "incoming" ? "#1a1a1a" : "#ffffff",
                          }}
                        >
                          {msg.direction === "outgoing" && msg.senderDisplayName && (
                            <p className="text-[11px] font-medium mb-0.5" style={{ opacity: 0.85 }}>
                              {msg.senderDisplayName}
                            </p>
                          )}
                          <p className="text-[15px] whitespace-pre-wrap break-words">{msg.content}</p>
                          <div
                            className="flex items-center gap-1 mt-1"
                            style={{ opacity: msg.direction === "incoming" ? 0.6 : 0.75 }}
                          >
                            <span className="text-[11px]">{formatTime(msg.createdAt)}</span>
                            {msg.direction === "outgoing" && (
                              <CheckCheck className="h-3.5 w-3.5 ml-0.5 text-blue-300" />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"></span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-1">Digitando...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <footer className="border-t p-4 shrink-0">
        {selectedFile && (
          <div className="mb-3 p-3 bg-muted rounded-lg flex items-center gap-3">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="h-16 w-16 object-cover rounded" />
            ) : (
              <div className="h-16 w-16 flex items-center justify-center bg-background rounded">
                <FileIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={clearSelectedFile} data-testid="button-clear-file">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInputChange}
          data-testid="input-file"
        />
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-attach-file"
              title="Anexar arquivo"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onContactClick}
              data-testid="button-save-contact"
              title="Ver/Editar Contato"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 relative">
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
              {!isInternalNote && cannedResponses.length > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Digite "/" para respostas rápidas
                </span>
              )}
            </div>
            {showCannedResponses && filteredCannedResponses.length > 0 && (
              <div
                ref={cannedDropdownRef}
                className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-lg shadow-lg max-h-60 overflow-auto z-50"
                data-testid="canned-responses-dropdown"
              >
                <div className="p-2 border-b">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />
                    Respostas Rápidas
                  </div>
                </div>
                <div className="py-1">
                  {filteredCannedResponses.map((response, index) => (
                    <button
                      key={response.id}
                      onClick={() => selectCannedResponse(response)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm",
                        index === selectedCannedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover-elevate"
                      )}
                      data-testid={`canned-response-option-${response.id}`}
                    >
                      <div className="font-mono text-xs text-muted-foreground mb-0.5">
                        /{response.shortcut}
                      </div>
                      <div className="line-clamp-2">{response.content}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isInternalNote ? "Escreva uma nota interna..." : "Digite uma mensagem..."}
              className={cn(
                "min-h-[48px] max-h-32 resize-none",
                isInternalNote && "border-amber-400 dark:border-amber-600"
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
