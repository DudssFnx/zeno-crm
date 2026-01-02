import { useEffect, useRef, useCallback } from "react";
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

interface ContactUpdatedEvent {
  companyId: string;
  contactId: string;
  avatarUrl?: string;
}

interface MessageMediaReadyEvent {
  companyId: string;
  conversationId: string;
  messageId: string;
  mediaUrl: string;
  mediaType: string;
  fileName?: string;
  mimetype?: string;
  fileSize?: number;
}

export function useRealtime() {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !user) {
      console.log("[Realtime] No token or user, skipping socket connection");
      return;
    }

    if (socketRef.current?.connected) {
      console.log("[Realtime] Socket already connected, skipping");
      return;
    }

    console.log("[Realtime] Initializing socket connection...");
    
    socketRef.current = io(window.location.origin, {
      transports: ["websocket", "polling"],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    const socket = socketRef.current;

    socket.on("connect", () => {
      console.log("[Realtime] Socket connected successfully, id:", socket.id);
      reconnectAttempts.current = 0;
    });

    socket.on("disconnect", (reason) => {
      console.log("[Realtime] Socket disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("[Realtime] Socket connection error:", error.message);
      reconnectAttempts.current++;
    });

    socket.on("reconnect", (attemptNumber) => {
      console.log("[Realtime] Socket reconnected after", attemptNumber, "attempts");
    });

    socket.on("message:created", (data: MessageCreatedEvent) => {
      console.log("[Realtime] message:created received:", {
        conversationId: data.conversationId,
        messageId: data.message?.id,
        direction: data.message?.direction,
        content: data.message?.content?.substring(0, 20),
      });
      
      if (data.companyId === user.companyId) {
        console.log("[Realtime] Invalidating caches for conversation:", data.conversationId);
        
        // Use refetchType: 'all' to force immediate refetch
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations", data.conversationId, "messages"],
          refetchType: 'all'
        });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations", data.conversationId],
          refetchType: 'all'
        });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations"],
          refetchType: 'all'
        });
      } else {
        console.log("[Realtime] Ignoring message from different company:", data.companyId, "vs", user.companyId);
      }
    });

    socket.on("conversation:updated", (data: ConversationUpdatedEvent) => {
      console.log("[Realtime] conversation:updated received:", data.conversationId);
      
      if (data.companyId === user.companyId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations"],
          refetchType: 'all'
        });
      }
    });

    socket.on("contact:updated", (data: ContactUpdatedEvent) => {
      console.log("[Realtime] contact:updated received:", data.contactId);
      
      if (data.companyId === user.companyId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/contacts"],
          refetchType: 'all'
        });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations"],
          refetchType: 'all'
        });
      }
    });

    socket.on("message:media_ready", (data: MessageMediaReadyEvent) => {
      console.log("[Realtime] message:media_ready received:", data.messageId, data.mediaType);
      
      if (data.companyId === user.companyId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations", data.conversationId, "messages"],
          refetchType: 'all'
        });
      }
    });

    return () => {
      console.log("[Realtime] Cleaning up socket connection");
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?.id, user?.companyId]);

  return socketRef.current;
}
