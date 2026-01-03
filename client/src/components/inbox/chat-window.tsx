import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, StickyNote, Phone, Check, CheckCheck, Zap, Paperclip, UserPlus, Calendar, X, FileIcon, ImageIcon, Search, Download, FileText, Film, Music, AlertCircle, Smile, Mic, Square, ArrowLeft, UserCircle, ArrowDown, Pencil, Loader2, CheckCircle, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRobotProgress } from "@/hooks/use-realtime";
import { queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import { cn, formatPhoneNumber } from "@/lib/utils";
import type { ConversationWithDetails, MessageWithSender, User, CannedResponse } from "@shared/schema";

interface Macro {
  id: string;
  name: string;
  description: string | null;
  messageTemplate: string | null;
  actions: Array<{ type: string; tagId?: string; status?: string; agentId?: string }>;
}

interface Robot {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  actions: Array<{ id: string; type: string }>;
}

interface ChatWindowProps {
  conversationId: string | null;
  onContactClick: () => void;
  onBack?: () => void;
  isMobile?: boolean;
}

interface MediaContentProps {
  mediaUrl: string;
  mediaType: string;
  fileName?: string | null;
  fileSize?: string | null;
  isOutgoing: boolean;
}

function formatFileSize(bytes: string | null | undefined): string {
  if (!bytes) return "";
  const size = parseInt(bytes, 10);
  if (isNaN(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function MediaContent({ mediaUrl, mediaType, fileName, fileSize, isOutgoing }: MediaContentProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [showLightbox, setShowLightbox] = useState(false);

  const textColor = isOutgoing ? "text-white" : "text-foreground";
  const mutedColor = isOutgoing ? "text-white/70" : "text-muted-foreground";

  if (mediaType === "image") {
    if (imageError) {
      return (
        <div className="flex items-center gap-2 py-2">
          <AlertCircle className={cn("h-5 w-5", mutedColor)} />
          <span className={cn("text-sm", mutedColor)}>Erro ao carregar imagem</span>
        </div>
      );
    }

    return (
      <>
        <div className="relative">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
              <LoadingSpinner size="sm" />
            </div>
          )}
          <img
            src={mediaUrl}
            alt={fileName || "Imagem"}
            className="max-w-[280px] max-h-[300px] rounded-lg cursor-pointer object-cover"
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageLoading(false);
              setImageError(true);
            }}
            onClick={() => setShowLightbox(true)}
            data-testid="media-image"
          />
        </div>
        {showLightbox && (
          <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-2">
              <img
                src={mediaUrl}
                alt={fileName || "Imagem"}
                className="w-full h-full object-contain rounded-lg"
                data-testid="media-image-lightbox"
              />
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  if (mediaType === "audio") {
    return (
      <div className="py-2">
        <audio
          controls
          className="max-w-[280px] h-10"
          preload="metadata"
          data-testid="media-audio"
        >
          <source src={mediaUrl} />
          Seu navegador não suporta reprodução de áudio.
        </audio>
        {fileName && (
          <p className={cn("text-xs mt-1 truncate max-w-[280px]", mutedColor)}>{fileName}</p>
        )}
      </div>
    );
  }

  if (mediaType === "video") {
    return (
      <div className="py-2">
        <video
          controls
          className="max-w-[280px] max-h-[200px] rounded-lg"
          preload="metadata"
          data-testid="media-video"
        >
          <source src={mediaUrl} />
          Seu navegador não suporta reprodução de vídeo.
        </video>
        {fileName && (
          <p className={cn("text-xs mt-1 truncate max-w-[280px]", mutedColor)}>{fileName}</p>
        )}
      </div>
    );
  }

  if (mediaType === "document") {
    const displayName = fileName || "Documento";
    const sizeDisplay = formatFileSize(fileSize);

    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName || true}
        className={cn(
          "flex items-center gap-3 py-2 px-3 rounded-lg transition-colors",
          isOutgoing 
            ? "bg-white/10 hover:bg-white/20" 
            : "bg-muted hover:bg-muted/80"
        )}
        data-testid="media-document"
      >
        <div className={cn(
          "flex items-center justify-center h-10 w-10 rounded-lg shrink-0",
          isOutgoing ? "bg-white/20" : "bg-primary/10"
        )}>
          <FileText className={cn("h-5 w-5", isOutgoing ? "text-white" : "text-primary")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium truncate", textColor)}>{displayName}</p>
          {sizeDisplay && (
            <p className={cn("text-xs", mutedColor)}>{sizeDisplay}</p>
          )}
        </div>
        <Download className={cn("h-4 w-4 shrink-0", mutedColor)} />
      </a>
    );
  }

  return null;
}

export function ChatWindow({ conversationId, onContactClick, onBack, isMobile }: ChatWindowProps) {
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [pendingAttributes, setPendingAttributes] = useState<string[]>([]);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [isMacroDialogOpen, setIsMacroDialogOpen] = useState(false);
  const [isRobotDialogOpen, setIsRobotDialogOpen] = useState(false);
  const pendingAttributesRef = useRef<string[]>([]);
  const pendingTagsRef = useRef<string[]>([]);
  const noteSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cannedDropdownRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Robot execution progress
  const robotProgress = useRobotProgress(conversationId);

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

  const { data: macros = [] } = useQuery<Macro[]>({
    queryKey: ["/api/macros"],
    queryFn: async () => {
      const res = await authFetch("/api/macros");
      if (!res.ok) throw new Error("Failed to fetch macros");
      return res.json();
    },
  });

  const { data: robots = [] } = useQuery<Robot[]>({
    queryKey: ["/api/robots"],
    queryFn: async () => {
      const res = await authFetch("/api/robots");
      if (!res.ok) throw new Error("Failed to fetch robots");
      return res.json();
    },
  });

  const activeRobots = useMemo(() => robots.filter(r => r.isActive), [robots]);

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
    mutationFn: async (data: { 
      content: string; 
      isInternalNote: boolean;
      mediaUrl?: string;
      mediaType?: string;
      fileName?: string;
      mimetype?: string;
    }) => {
      const endpoint = data.isInternalNote
        ? `/api/conversations/${conversationId}/internal-notes`
        : `/api/conversations/${conversationId}/messages`;
      
      const payload: Record<string, string | undefined> = { content: data.content };
      
      if (data.mediaUrl && data.mediaType) {
        payload.mediaUrl = data.mediaUrl;
        payload.mediaType = data.mediaType;
        payload.fileName = data.fileName;
        payload.mimetype = data.mimetype;
        console.log("[ChatWindow] Sending media message:", { mediaUrl: data.mediaUrl, mediaType: data.mediaType, fileName: data.fileName, mimetype: data.mimetype });
      }
      
      const res = await authFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Falha ao enviar mensagem" }));
        throw new Error(error.message || "Falha ao enviar mensagem");
      }
      return res.json();
    },
    onSuccess: async () => {
      setMessage("");
      setIsTyping(false);
      clearSelectedFile();
      
      // Aplicar atributos se houver pendentes da resposta rápida (usando ref para evitar stale closure)
      const attrsToApply = pendingAttributesRef.current;
      console.log("[ChatWindow] onSuccess - pendingAttributesRef:", attrsToApply, "contactId:", conversation?.contact?.id);
      if (attrsToApply.length > 0 && conversation?.contact?.id) {
        try {
          // Combinar atributos existentes com novos (máximo 3)
          const currentAttrs = conversation.contact.attributes || [];
          const combinedAttrs = [...currentAttrs, ...attrsToApply];
          const uniqueAttrs = combinedAttrs.filter((attr, index) => combinedAttrs.indexOf(attr) === index);
          const newAttrs = uniqueAttrs.slice(0, 3);
          console.log("[ChatWindow] Aplicando atributos - currentAttrs:", currentAttrs, "newAttrs:", newAttrs);
          
          if (newAttrs.length > 3) {
            toast({ 
              title: "Limite de atributos atingido", 
              description: "O contato já possui 3 atributos. Remova um nos detalhes do contato para adicionar novos.",
              variant: "destructive" 
            });
          } else {
            const res = await authFetch(`/api/contacts/${conversation.contact.id}`, {
              method: "PUT",
              body: JSON.stringify({ attributes: newAttrs }),
            });
            console.log("[ChatWindow] Resultado da atualização de atributos:", res.ok);
            queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
          }
        } catch (e) {
          console.error("[ChatWindow] Falha ao aplicar atributos:", e);
        }
        // Limpar o ref e state
        pendingAttributesRef.current = [];
        setPendingAttributes([]);
      }

      // Aplicar etiquetas se houver pendentes da resposta rápida
      const tagsToApply = pendingTagsRef.current;
      console.log("[ChatWindow] onSuccess - pendingTagsRef:", tagsToApply, "contactId:", conversation?.contact?.id);
      if (tagsToApply.length > 0 && conversation?.contact?.id) {
        try {
          for (const tagId of tagsToApply) {
            console.log("[ChatWindow] Aplicando etiqueta:", tagId);
            const res = await authFetch(`/api/contacts/${conversation.contact.id}/tags`, {
              method: "POST",
              body: JSON.stringify({ tagId }),
            });
            console.log("[ChatWindow] Resultado da aplicação de etiqueta:", res.ok);
          }
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
        } catch (e) {
          console.error("[ChatWindow] Falha ao aplicar etiquetas:", e);
        }
        // Limpar o ref e state
        pendingTagsRef.current = [];
        setPendingTags([]);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao enviar mensagem", variant: "destructive" });
      pendingAttributesRef.current = [];
      setPendingAttributes([]);
      pendingTagsRef.current = [];
      setPendingTags([]);
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

  const updateContactNotes = useMutation({
    mutationFn: async (notes: string) => {
      const res = await authFetch(`/api/contacts/${conversation?.contact?.id}`, {
        method: "PUT",
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to update notes");
      return res.json();
    },
    onSuccess: () => {
      setNoteSaveStatus("saved");
      setTimeout(() => setNoteSaveStatus("idle"), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: () => {
      toast({ title: "Falha ao salvar anotação", variant: "destructive" });
      setNoteSaveStatus("idle");
    },
  });

  const executeMacro = useMutation({
    mutationFn: async (macroId: string) => {
      const res = await authFetch("/api/macros/execute", {
        method: "POST",
        body: JSON.stringify({ macroId, conversationId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Falha ao executar macro" }));
        throw new Error(error.message || "Falha ao executar macro");
      }
      return res.json();
    },
    onSuccess: () => {
      setIsMacroDialogOpen(false);
      toast({ title: "Macro executada com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const executeRobot = useMutation({
    mutationFn: async (robotId: string) => {
      const res = await authFetch("/api/robots/execute", {
        method: "POST",
        body: JSON.stringify({ robotId, conversationId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Falha ao executar robo" }));
        throw new Error(error.message || "Falha ao executar robo");
      }
      return res.json();
    },
    onSuccess: () => {
      setIsRobotDialogOpen(false);
      toast({ title: "Robo iniciado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsAtBottom(distanceFromBottom < 100);
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom]);

  useEffect(() => {
    scrollToBottom("instant");
    setIsAtBottom(true);
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    
    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
    if (viewport) {
      viewportRef.current = viewport;
      viewport.addEventListener('scroll', handleScroll);
      return () => viewport.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll, conversationId]);

  useEffect(() => {
    if (conversation?.contact?.notes !== undefined) {
      setNoteValue(conversation.contact.notes || "");
    }
    setIsEditingNote(false);
    setNoteSaveStatus("idle");
  }, [conversationId, conversation?.contact?.notes]);

  useEffect(() => {
    if (isEditingNote && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [isEditingNote]);

  const handleNoteChange = useCallback((value: string) => {
    setNoteValue(value);
    setNoteSaveStatus("saving");
    
    if (noteSaveTimeoutRef.current) {
      clearTimeout(noteSaveTimeoutRef.current);
    }
    
    noteSaveTimeoutRef.current = setTimeout(() => {
      updateContactNotes.mutate(value);
    }, 500);
  }, [updateContactNotes]);

  const handleNoteBlur = useCallback(() => {
    setIsEditingNote(false);
    if (noteSaveTimeoutRef.current) {
      clearTimeout(noteSaveTimeoutRef.current);
    }
    if (noteValue !== (conversation?.contact?.notes || "")) {
      updateContactNotes.mutate(noteValue);
    }
  }, [noteValue, conversation?.contact?.notes, updateContactNotes]);

  const handleNoteKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNoteBlur();
    }
    if (e.key === "Escape") {
      setNoteValue(conversation?.contact?.notes || "");
      setIsEditingNote(false);
      setNoteSaveStatus("idle");
    }
  }, [handleNoteBlur, conversation?.contact?.notes]);

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
    console.log("[ChatWindow] Selecionada resposta rápida:", response.shortcut, "atributos:", response.attributes, "tags:", response.tagIds);
    setMessage(response.content);
    setShowCannedResponses(false);
    setCannedSearchTerm("");
    if (response.attributes && response.attributes.length > 0) {
      console.log("[ChatWindow] Definindo pendingAttributes (ref):", response.attributes);
      setPendingAttributes(response.attributes);
      pendingAttributesRef.current = response.attributes;
    }
    if (response.tagIds && response.tagIds.length > 0) {
      console.log("[ChatWindow] Definindo pendingTags (ref):", response.tagIds);
      setPendingTags(response.tagIds);
      pendingTagsRef.current = response.tagIds;
    }
    textareaRef.current?.focus();
  };

  const getMediaTypeFromMimetype = (mimetype: string): string => {
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("audio/")) return "audio";
    if (mimetype.startsWith("video/")) return "video";
    return "document";
  };

  const handleSend = async () => {
    const hasMessage = message.trim();
    const hasFile = selectedFile !== null;
    
    if (!hasMessage && !hasFile) return;
    
    try {
      let mediaData: { mediaUrl: string; mediaType: string; fileName: string; mimetype: string } | null = null;
      
      if (hasFile && selectedFile) {
        console.log("[ChatWindow] Uploading file:", selectedFile.name, selectedFile.type, selectedFile.size);
        
        const formData = new FormData();
        formData.append("file", selectedFile);
        
        const uploadRes = await authFetch("/api/upload", {
          method: "POST",
          body: formData,
          headers: {},
        });
        
        if (!uploadRes.ok) {
          const error = await uploadRes.json().catch(() => ({ message: "Falha ao fazer upload do arquivo" }));
          throw new Error(error.message || "Falha ao fazer upload do arquivo");
        }
        
        const uploadData = await uploadRes.json();
        console.log("[ChatWindow] Upload response:", uploadData);
        
        const mediaType = getMediaTypeFromMimetype(uploadData.mimetype || selectedFile.type);
        
        mediaData = {
          mediaUrl: uploadData.url,
          mediaType,
          fileName: uploadData.fileName || selectedFile.name,
          mimetype: uploadData.mimetype || selectedFile.type,
        };
        
        console.log("[ChatWindow] Media data prepared:", mediaData);
      }
      
      sendMessage.mutate({
        content: hasMessage ? message.trim() : "",
        isInternalNote,
        ...(mediaData || {}),
      });
    } catch (error) {
      console.error("[ChatWindow] Error in handleSend:", error);
      toast({ 
        title: error instanceof Error ? error.message : "Falha ao enviar mensagem", 
        variant: "destructive" 
      });
    }
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

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessage((prev) => prev + emojiData.emoji);
      setShowEmojiPicker(false);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newMessage = message.substring(0, start) + emojiData.emoji + message.substring(end);
    setMessage(newMessage);
    setShowEmojiPicker(false);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + emojiData.emoji.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        
        if (audioChunksRef.current.length === 0) {
          toast({ title: "Nenhum áudio gravado", variant: "destructive" });
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        try {
          const formData = new FormData();
          const extension = mediaRecorder.mimeType?.includes("webm") ? "webm" : "mp4";
          formData.append("file", audioBlob, `audio-${Date.now()}.${extension}`);

          const uploadRes = await authFetch("/api/upload", {
            method: "POST",
            body: formData,
            headers: {},
          });

          if (!uploadRes.ok) {
            const error = await uploadRes.json().catch(() => ({ message: "Falha ao fazer upload do áudio" }));
            throw new Error(error.message || "Falha ao fazer upload do áudio");
          }

          const uploadData = await uploadRes.json();

          sendMessage.mutate({
            content: "",
            isInternalNote: false,
            mediaUrl: uploadData.url,
            mediaType: "audio",
            fileName: uploadData.fileName,
            mimetype: uploadData.mimetype || mediaRecorder.mimeType,
          });
        } catch (error) {
          console.error("[ChatWindow] Error uploading audio:", error);
          toast({
            title: error instanceof Error ? error.message : "Falha ao enviar áudio",
            variant: "destructive",
          });
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("[ChatWindow] Error starting recording:", error);
      if (error instanceof Error && error.name === "NotAllowedError") {
        toast({ title: "Permissão de microfone negada", variant: "destructive" });
      } else if (error instanceof Error && error.name === "NotFoundError") {
        toast({ title: "Microfone não encontrado", variant: "destructive" });
      } else {
        toast({ title: "Erro ao iniciar gravação", variant: "destructive" });
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

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
      className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden"
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
      <header className="border-b shrink-0">
        <div className="h-14 flex items-center justify-between gap-2 px-3 md:px-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isMobile && onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="shrink-0 min-h-[44px] min-w-[44px]"
                data-testid="button-back-to-list"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <button
              onClick={onContactClick}
              className="flex items-center gap-3 hover-elevate rounded-lg p-1 min-w-0 flex-1"
              data-testid="button-contact-details"
            >
              <AvatarWithFallback
                name={conversation.contact.name}
                src={conversation.contact.avatarUrl}
                size="md"
              />
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium text-[15px] truncate">{conversation.contact.name}</div>
                <div className="text-xs text-muted-foreground truncate">{formatPhoneNumber(conversation.contact.phoneNumber)}</div>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onContactClick}
                className="min-h-[44px] min-w-[44px]"
                data-testid="button-contact-details-mobile"
              >
                <UserCircle className="h-5 w-5" />
              </Button>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        
        <div className="px-3 md:px-4 pb-2 flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground shrink-0" />
          {isEditingNote ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Input
                ref={noteInputRef}
                value={noteValue}
                onChange={(e) => handleNoteChange(e.target.value)}
                onBlur={handleNoteBlur}
                onKeyDown={handleNoteKeyDown}
                placeholder="Adicionar anotação..."
                className="h-7 text-sm flex-1"
                data-testid="input-contact-note"
              />
              {noteSaveStatus === "saving" && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              )}
              {noteSaveStatus === "saved" && (
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsEditingNote(true)}
              className="flex items-center gap-2 text-sm text-left hover-elevate rounded px-2 py-1 -mx-2 flex-1 min-w-0 group"
              data-testid="button-edit-note"
            >
              <span className={cn(
                "truncate flex-1",
                noteValue ? "text-foreground" : "text-muted-foreground italic"
              )}>
                {noteValue || "Sem anotação"}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              {noteSaveStatus === "saved" && (
                <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Robot Progress Indicator */}
      {robotProgress && (
        <div className="shrink-0 border-b bg-primary/5 px-3 md:px-4 py-2" data-testid="robot-progress-bar">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Bot className={cn(
                "h-5 w-5 shrink-0",
                robotProgress.status === "running" && "text-primary animate-pulse",
                robotProgress.status === "completed" && "text-green-500",
                robotProgress.status === "failed" && "text-destructive",
                robotProgress.status === "cancelled" && "text-muted-foreground"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {robotProgress.robotName || "Robot"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({robotProgress.currentStep}/{robotProgress.totalSteps})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs truncate",
                    robotProgress.status === "running" && "text-primary",
                    robotProgress.status === "completed" && "text-green-600",
                    robotProgress.status === "failed" && "text-destructive",
                    robotProgress.status === "cancelled" && "text-muted-foreground"
                  )}>
                    {robotProgress.status === "running" && robotProgress.currentActionLabel}
                    {robotProgress.status === "completed" && "Concluido com sucesso"}
                    {robotProgress.status === "failed" && "Falha na execucao"}
                    {robotProgress.status === "cancelled" && "Cancelado"}
                  </span>
                </div>
              </div>
            </div>
            <div className="w-32 shrink-0">
              <Progress 
                value={(robotProgress.currentStep / robotProgress.totalSteps) * 100} 
                className={cn(
                  "h-2",
                  robotProgress.status === "completed" && "[&>div]:bg-green-500",
                  robotProgress.status === "failed" && "[&>div]:bg-destructive",
                  robotProgress.status === "cancelled" && "[&>div]:bg-muted-foreground"
                )}
              />
            </div>
          </div>
        </div>
      )}

      <div 
        ref={scrollAreaRef}
        className="flex-1 relative min-h-0 overflow-y-auto scrollbar-always-visible"
        style={{
          backgroundColor: "hsl(var(--background))",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%2325D366' fill-opacity='0.05'%3E%3Cpath opacity='.5' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/%3E%3Cpath d='M6 5V0H5v5H0v1h5v94h1V6h94V5H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
        data-testid="messages-container"
      >
        <div className="p-4">
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
                              : "rounded-br-md",
                            msg.mediaUrl && msg.mediaType === "image" && "px-2 py-2"
                          )}
                          style={{
                            backgroundColor: msg.direction === "incoming" ? "#e3f2fd" : "#1565c0",
                            color: msg.direction === "incoming" ? "#1a1a1a" : "#ffffff",
                          }}
                        >
                          {msg.direction === "outgoing" && msg.senderDisplayName && (
                            <p className="text-[11px] font-medium mb-0.5" style={{ opacity: 0.85 }}>
                              {msg.senderDisplayName}
                            </p>
                          )}
                          {msg.mediaUrl && msg.mediaType && msg.mediaType !== "text" && (
                            <MediaContent
                              mediaUrl={msg.mediaUrl}
                              mediaType={msg.mediaType}
                              fileName={msg.fileName}
                              fileSize={msg.fileSize}
                              isOutgoing={msg.direction === "outgoing"}
                            />
                          )}
                          {msg.content && (
                            <p className={cn(
                              "text-[15px] whitespace-pre-wrap break-words",
                              msg.mediaUrl && msg.mediaType && msg.mediaType !== "text" && "mt-2 px-2"
                            )}>{msg.content}</p>
                          )}
                          <div
                            className={cn(
                              "flex items-center gap-1 mt-1",
                              msg.mediaUrl && msg.mediaType === "image" && "px-2"
                            )}
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
            <div ref={messagesEndRef} />
          </div>
        )}
        </div>
        {!isAtBottom && messages.length > 0 && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-4 right-4 rounded-full shadow-lg z-10"
            onClick={() => {
              scrollToBottom();
              setIsAtBottom(true);
            }}
            data-testid="button-scroll-to-bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>

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
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              variant={isInternalNote ? "default" : "outline"}
              size="sm"
              onClick={() => setIsInternalNote(!isInternalNote)}
              data-testid="button-toggle-internal-note"
            >
              <StickyNote className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Nota Interna</span>
              <span className="sm:hidden">Nota</span>
            </Button>

            <Dialog open={isMacroDialogOpen} onOpenChange={setIsMacroDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-testid="button-macros"
                >
                  <Zap className="h-4 w-4 text-amber-500" />
                  Macros
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Executar Macro</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <div className="space-y-2">
                    {macros.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma macro disponível.
                      </p>
                    ) : (
                      macros.map((macro) => (
                        <Button
                          key={macro.id}
                          variant="ghost"
                          className="w-full justify-start text-left h-auto p-3 flex flex-col items-start gap-1"
                          onClick={() => executeMacro.mutate(macro.id)}
                          disabled={executeMacro.isPending}
                          data-testid={`button-macro-${macro.id}`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className="font-medium text-sm">{macro.name}</span>
                            {executeMacro.isPending && executeMacro.variables === macro.id && (
                              <LoadingSpinner size="sm" className="ml-auto" />
                            )}
                          </div>
                          {macro.description && (
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {macro.description}
                            </span>
                          )}
                        </Button>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isRobotDialogOpen} onOpenChange={setIsRobotDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-testid="button-robots"
                >
                  <Bot className="h-4 w-4 text-emerald-500" />
                  <span className="hidden sm:inline">Robos</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Executar Robo</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <div className="space-y-2">
                    {activeRobots.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum robo ativo disponivel.
                      </p>
                    ) : (
                      activeRobots.map((robot) => (
                        <Button
                          key={robot.id}
                          variant="ghost"
                          className="w-full justify-start text-left h-auto p-3 flex flex-col items-start gap-1"
                          onClick={() => executeRobot.mutate(robot.id)}
                          disabled={executeRobot.isPending}
                          data-testid={`button-robot-${robot.id}`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Bot className="h-4 w-4 text-emerald-500" />
                            <span className="font-medium text-sm">{robot.name}</span>
                            {executeRobot.isPending && (
                              <LoadingSpinner size="sm" className="ml-auto" />
                            )}
                          </div>
                          {robot.description && (
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {robot.description}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {robot.actions.length} acoes
                          </span>
                        </Button>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {isInternalNote && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Esta nota é visível apenas para sua equipe
              </span>
            )}
            {!isInternalNote && cannedResponses.length > 0 && (
              <span className="text-xs text-muted-foreground items-center gap-1 hidden sm:flex">
                <Zap className="h-3 w-3" />
                Digite "/" para respostas rápidas
              </span>
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex items-center shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-attach-file"
                title="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid="button-emoji-picker"
                    title="Inserir emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-auto p-0 border-0" 
                  side="top" 
                  align="start"
                  sideOffset={8}
                >
                  <EmojiPicker
                    onEmojiClick={handleEmojiSelect}
                    theme={document.documentElement.classList.contains("dark") ? Theme.DARK : Theme.LIGHT}
                    width={320}
                    height={400}
                    searchPlaceholder="Buscar emoji..."
                    previewConfig={{ showPreview: false }}
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                onClick={onContactClick}
                data-testid="button-save-contact"
                title="Ver/Editar Contato"
                className="hidden sm:flex"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 min-w-0 relative">
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
          {isRecording ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 rounded-lg">
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-medium text-destructive">
                  {formatRecordingTime(recordingTime)}
                </span>
              </div>
              <Button
                variant="destructive"
                size="icon"
                onClick={stopRecording}
                data-testid="button-stop-recording"
                title="Parar gravação"
              >
                <Square className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={startRecording}
                disabled={isInternalNote}
                data-testid="button-start-recording"
                title="Gravar áudio"
              >
                <Mic className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleSend}
                disabled={(!message.trim() && !selectedFile) || sendMessage.isPending}
                data-testid="button-send-message"
              >
                {sendMessage.isPending ? (
                  <LoadingSpinner size="sm" className="text-primary-foreground" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
