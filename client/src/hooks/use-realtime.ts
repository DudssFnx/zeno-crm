import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

interface MessageCreatedEvent {
  companyId: string;
  conversationId: string;
  contactId: string;
  message: {
    id: string;
    content: string;
    direction: string;
    createdAt: string;
  };
}

interface ConversationUpdatedEvent {
  companyId: string;
  conversationId: string;
  lastMessage: string;
  lastMessageAt: string;
}

export function useRealtime() {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token || !user) return;

    socketRef.current = io(window.location.origin, {
      transports: ["websocket", "polling"],
      auth: { token },
    });

    socketRef.current.on("connect", () => {
      console.log("[Realtime] Socket connected");
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("[Realtime] Socket error:", error.message);
    });

    socketRef.current.on("message:created", (data: MessageCreatedEvent) => {
      if (data.companyId === user.companyId) {
        console.log("[Realtime] New message received, invalidating cache");
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", data.conversationId] });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", data.conversationId, "messages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      }
    });

    socketRef.current.on("conversation:updated", (data: ConversationUpdatedEvent) => {
      if (data.companyId === user.companyId) {
        console.log("[Realtime] Conversation updated, invalidating list");
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  return socketRef.current;
}
