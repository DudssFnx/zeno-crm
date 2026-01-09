import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

// Global state for robot progress (accessible across components)
interface RobotProgressData {
  executionId: string;
  robotId: string;
  robotName: string;
  conversationId: string;
  currentStep: number;
  totalSteps: number;
  currentActionType: string;
  currentActionLabel: string;
  status: "running" | "completed" | "failed" | "cancelled";
}

type RobotProgressListener = (data: RobotProgressData | null) => void;
const robotProgressListeners: Set<RobotProgressListener> = new Set();
let currentRobotProgress: RobotProgressData | null = null;

export function subscribeToRobotProgress(listener: RobotProgressListener) {
  robotProgressListeners.add(listener);
  // Send current state immediately
  listener(currentRobotProgress);
  return () => {
    robotProgressListeners.delete(listener);
  };
}

function notifyRobotProgress(data: RobotProgressData | null) {
  currentRobotProgress = data;
  robotProgressListeners.forEach(listener => listener(data));
}

export function useRobotProgress(conversationId: string | null) {
  const [progress, setProgress] = useState<RobotProgressData | null>(null);
  
  useEffect(() => {
    const unsubscribe = subscribeToRobotProgress((data) => {
      if (data && data.conversationId === conversationId) {
        setProgress(data);
        // Clear after completion
        if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
          setTimeout(() => setProgress(null), 3000);
        }
      } else if (!data) {
        setProgress(null);
      }
    });
    return unsubscribe;
  }, [conversationId]);
  
  return progress;
}

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

interface ConversationDeletedEvent {
  companyId: string;
  conversationId: string;
}

interface ContactDeletedEvent {
  companyId: string;
  contactId: string;
}

interface ContactPresenceEvent {
  companyId: string;
  conversationId: string;
  contactId: string;
  phoneNumber: string;
  presence: "typing" | "recording" | "available";
}

// Global state for contact presence (accessible across components)
type ContactPresenceListener = (conversationId: string, presence: "typing" | "recording" | "available" | null) => void;
const contactPresenceListeners: Set<ContactPresenceListener> = new Set();
const contactPresenceState: Map<string, { presence: "typing" | "recording"; timeout: NodeJS.Timeout }> = new Map();

export function subscribeToContactPresence(listener: ContactPresenceListener) {
  contactPresenceListeners.add(listener);
  return () => {
    contactPresenceListeners.delete(listener);
  };
}

function notifyContactPresence(conversationId: string, presence: "typing" | "recording" | "available" | null) {
  contactPresenceListeners.forEach(listener => listener(conversationId, presence));
}

function handleContactPresence(conversationId: string, presence: "typing" | "recording" | "available") {
  const existing = contactPresenceState.get(conversationId);
  
  if (presence === "available") {
    // Contact stopped typing/recording
    if (existing) {
      clearTimeout(existing.timeout);
      contactPresenceState.delete(conversationId);
    }
    notifyContactPresence(conversationId, null);
  } else {
    // Contact is typing or recording
    if (existing) {
      clearTimeout(existing.timeout);
    }
    
    // Auto-clear after 5 seconds (in case we miss the "available" event)
    const timeout = setTimeout(() => {
      contactPresenceState.delete(conversationId);
      notifyContactPresence(conversationId, null);
    }, 5000);
    
    contactPresenceState.set(conversationId, { presence, timeout });
    notifyContactPresence(conversationId, presence);
  }
}

export function useContactPresence(conversationId: string | null) {
  const [presence, setPresence] = useState<"typing" | "recording" | null>(null);
  
  useEffect(() => {
    if (!conversationId) {
      setPresence(null);
      return;
    }
    
    const unsubscribe = subscribeToContactPresence((convId, pres) => {
      if (convId === conversationId) {
        setPresence(pres === "available" ? null : pres);
      }
    });
    
    // Check initial state
    const existing = contactPresenceState.get(conversationId);
    if (existing) {
      setPresence(existing.presence);
    }
    
    return unsubscribe;
  }, [conversationId]);
  
  return presence;
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
      // Clear stale cache on reconnection to prevent duplicate key errors
      queryClient.cancelQueries({ queryKey: ["/api/conversations"] });
      queryClient.resetQueries({ queryKey: ["/api/conversations"] });
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
        
        // Cancel pending queries to avoid race conditions
        queryClient.cancelQueries({ queryKey: ["/api/conversations"] });
        
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
        queryClient.cancelQueries({ queryKey: ["/api/conversations"] });
        queryClient.invalidateQueries({ 
          queryKey: ["/api/conversations"],
          refetchType: 'all'
        });
      }
    });

    socket.on("contact:updated", (data: ContactUpdatedEvent) => {
      console.log("[Realtime] contact:updated received:", data.contactId);
      
      if (data.companyId === user.companyId) {
        queryClient.cancelQueries({ queryKey: ["/api/contacts"] });
        queryClient.cancelQueries({ queryKey: ["/api/conversations"] });
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

    socket.on("conversation:deleted", (data: ConversationDeletedEvent) => {
      console.log("[Realtime] conversation:deleted received:", data.conversationId);
      
      if (data.companyId === user.companyId) {
        // Cancel and reset cache to avoid stale references
        queryClient.cancelQueries({ queryKey: ["/api/conversations"] });
        queryClient.resetQueries({ queryKey: ["/api/conversations"] });
      }
    });

    socket.on("contact:deleted", (data: ContactDeletedEvent) => {
      console.log("[Realtime] contact:deleted received:", data.contactId);
      
      if (data.companyId === user.companyId) {
        queryClient.cancelQueries({ queryKey: ["/api/contacts"] });
        queryClient.cancelQueries({ queryKey: ["/api/conversations"] });
        queryClient.resetQueries({ queryKey: ["/api/contacts"] });
        queryClient.resetQueries({ queryKey: ["/api/conversations"] });
      }
    });

    socket.on("robot:progress", (data: RobotProgressData) => {
      console.log("[Realtime] robot:progress received:", data.robotName, data.currentStep, "/", data.totalSteps, data.status);
      notifyRobotProgress(data);
      
      // Clear progress after completion
      if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
        setTimeout(() => notifyRobotProgress(null), 5000);
      }
    });

    socket.on("contact:presence", (data: ContactPresenceEvent) => {
      console.log("[Realtime] contact:presence received:", data.conversationId, data.presence);
      
      if (data.companyId === user.companyId) {
        handleContactPresence(data.conversationId, data.presence);
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
