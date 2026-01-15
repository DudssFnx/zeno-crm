// ⚠️ ARQUIVO ATUALIZADO PARA BUILD PRODUÇÃO (VITE / RAILWAY)

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mic,
  Phone,
  Send,
  Square
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useToast } from "@/hooks/use-toast";
import { useAuth, useAuthFetch } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { cn, formatPhoneNumber } from "@/lib/utils";

import type {
  ConversationWithDetails,
  MessageWithSender
} from "@shared/schema";

/* ======================= TIPOS ======================= */

interface ChatWindowProps {
  conversationId: string | null;
  onContactClick: () => void;
  onBack?: () => void;
  isMobile?: boolean;
}

/* ======================= COMPONENTE ======================= */

export function ChatWindow({
  conversationId,
  onContactClick,
  onBack,
  isMobile,
}: ChatWindowProps) {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();

  /* ======================= STATE ======================= */

  const [message, setMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /* ======================= REFS ======================= */

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);

  /* ======================= FETCH ======================= */

  const { data: conversation, isLoading } = useQuery<ConversationWithDetails>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const res = await authFetch(`/api/conversations/${conversationId}`);
      if (!res.ok) throw new Error("Erro ao carregar conversa");
      return res.json();
    },
  });

  const { data: messagesData } = useQuery<{
    messages: MessageWithSender[];
  }>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
    queryFn: async () => {
      const res = await authFetch(`/api/conversations/${conversationId}/messages?limit=50`);
      if (!res.ok) throw new Error("Erro ao carregar mensagens");
      return res.json();
    },
  });

  const messages = messagesData?.messages || [];

  /* ======================= SCROLL ======================= */

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isAtBottom) scrollToBottom();
  }, [messages, isAtBottom, scrollToBottom]);

  /* ======================= SEND MESSAGE ======================= */

  const sendMessage = useMutation({
    mutationFn: async (payload: { content: string; isInternalNote: boolean }) => {
      const endpoint = payload.isInternalNote
        ? `/api/conversations/${conversationId}/internal-notes`
        : `/api/conversations/${conversationId}/messages`;

      const res = await authFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ content: payload.content }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erro ao enviar mensagem");
      }
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  /* ======================= AUDIO ======================= */

  const startRecording = async () => {
    if (!("MediaRecorder" in window)) {
      toast({
        title: "Gravação não suportada",
        description: "Seu navegador não suporta gravação de áudio",
        variant: "destructive",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      toast({ title: "Erro ao acessar microfone", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current);
      }
      mediaRecorderRef.current?.stop();
    };
  }, []);

  /* ======================= RENDER ======================= */

  if (!conversationId) {
    return (
      <EmptyState
        icon={Phone}
        title="Selecione uma conversa"
        description="Escolha uma conversa para começar"
      />
    );
  }

  if (isLoading || !conversation) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* HEADER */}
      <header className="border-b p-3 flex items-center gap-3">
        {isMobile && onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft />
          </Button>
        )}
        <button onClick={onContactClick} className="flex items-center gap-3">
          <AvatarWithFallback
            name={conversation.contact.name}
            src={conversation.contact.avatarUrl}
          />
          <div>
            <div className="font-medium">{conversation.contact.name}</div>
            <div className="text-xs text-muted-foreground">
              {formatPhoneNumber(conversation.contact.phoneNumber)}
            </div>
          </div>
        </button>
      </header>

      {/* MESSAGES */}
      <ScrollArea className="flex-1 p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "mb-2 max-w-[70%]",
              msg.direction === "outgoing" ? "ml-auto text-right" : "mr-auto"
            )}
          >
            <div
              className={cn(
                "rounded-lg px-3 py-2",
                msg.direction === "outgoing"
                  ? "bg-primary text-white"
                  : "bg-muted"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* FOOTER */}
      <footer className="border-t p-3 flex gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Digite uma mensagem..."
        />
        {isRecording ? (
          <Button variant="destructive" onClick={stopRecording}>
            <Square />
          </Button>
        ) : (
          <Button onClick={startRecording} variant="ghost">
            <Mic />
          </Button>
        )}
        <Button
          onClick={() =>
            sendMessage.mutate({ content: message.trim(), isInternalNote })
          }
          disabled={!message.trim()}
        >
          <Send />
        </Button>
      </footer>
    </div>
  );
}
