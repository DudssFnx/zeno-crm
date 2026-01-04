import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, Phone, MessageSquare, Settings, Tag as TagIcon, Clock, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "./dashboard";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useEffect } from "react";
import { GripVertical } from "lucide-react";
import { formatPhoneNumber, cn } from "@/lib/utils";
import type { Tag, ConversationWithDetails } from "@shared/schema";

function formatTimeInStage(stageEnteredAt: Date | string | null | undefined): string {
  if (!stageEnteredAt) return "";
  const entered = new Date(stageEnteredAt);
  const now = new Date();
  const diffMs = now.getTime() - entered.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return "agora";
}

function getTimeColor(stageEnteredAt: Date | string | null | undefined): string {
  if (!stageEnteredAt) return "text-muted-foreground";
  const entered = new Date(stageEnteredAt);
  const now = new Date();
  const diffHours = (now.getTime() - entered.getTime()) / (1000 * 60 * 60);
  
  if (diffHours >= 48) return "text-destructive";
  if (diffHours >= 24) return "text-amber-500";
  return "text-muted-foreground";
}

interface SortableConversationCardProps {
  conversation: ConversationWithDetails;
  onClick: () => void;
  uniqueId: string;
  showTime?: boolean;
}

function SortableConversationCard({ conversation, onClick, uniqueId, showTime }: SortableConversationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: uniqueId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const timeInStage = formatTimeInStage((conversation as any).stageEnteredAt);
  const timeColor = getTimeColor((conversation as any).stageEnteredAt);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing hover-elevate"
      onClick={onClick}
      data-testid={`kanban-card-${conversation.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <AvatarWithFallback 
            name={conversation.contact.name} 
            src={conversation.contact.avatarUrl} 
            size="sm" 
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="font-medium text-sm truncate">{conversation.contact.name}</p>
              {showTime && timeInStage && (
                <span className={cn("text-xs font-medium flex items-center gap-0.5 shrink-0", timeColor)}>
                  <Clock className="h-3 w-3" />
                  {timeInStage}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {formatPhoneNumber(conversation.contact.phoneNumber)}
            </p>
            {conversation.lastMessage && (
              <p className="text-xs text-muted-foreground truncate mt-1">
                <MessageSquare className="h-3 w-3 inline mr-1" />
                {conversation.lastMessage.content.substring(0, 50)}
                {conversation.lastMessage.content.length > 50 ? "..." : ""}
              </p>
            )}
          </div>
        </div>
        {conversation.tags && conversation.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {conversation.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-xs"
                style={{ backgroundColor: tag.color + "20", color: tag.color }}
              >
                {tag.name}
              </Badge>
            ))}
            {conversation.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{conversation.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConversationCard({ conversation }: { conversation: ConversationWithDetails }) {
  return (
    <Card className="cursor-grab active:cursor-grabbing hover-elevate">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <AvatarWithFallback 
            name={conversation.contact.name} 
            src={conversation.contact.avatarUrl} 
            size="sm" 
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{conversation.contact.name}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {formatPhoneNumber(conversation.contact.phoneNumber)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TagColumnProps {
  tag: Tag;
  conversations: ConversationWithDetails[];
  onConversationClick: (conv: ConversationWithDetails) => void;
  showTime?: boolean;
}

function SortableTagColumn({ tag, conversations, onConversationClick, showTime }: TagColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `column-${tag.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="w-72 shrink-0 flex flex-col bg-muted/50 rounded-lg"
      data-testid={`column-${tag.id}`}
    >
      <div 
        className="p-3 border-b flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
        style={{ borderBottomColor: tag.color, borderBottomWidth: '2px' }}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: tag.color }}
          />
          <span className="font-medium text-sm truncate">{tag.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          {conversations.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 p-2">
        <SortableContext
          id={tag.id}
          items={conversations.map(c => `${c.id}_${tag.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-[100px]" data-tag-id={tag.id}>
            {conversations.map((conv) => (
              <SortableConversationCard
                key={`${conv.id}_${tag.id}`}
                uniqueId={`${conv.id}_${tag.id}`}
                conversation={conv}
                onClick={() => onConversationClick(conv)}
                showTime={showTime}
              />
            ))}
            {conversations.length === 0 && (
              <div 
                className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg"
                data-testid={`tag-drop-${tag.id}`}
              >
                Arraste conversas aqui
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

export default function KanbanPage() {
  const authFetch = useAuthFetch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeConversation, setActiveConversation] = useState<ConversationWithDetails | null>(null);
  const [orderedTags, setOrderedTags] = useState<Tag[]>([]);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [showTimeInStage, setShowTimeInStage] = useState(() => {
    const saved = localStorage.getItem("kanban-show-time");
    return saved === "true";
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: tags = [], isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Falha ao buscar etiquetas");
      return res.json();
    },
  });

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/conversations"],
    queryFn: async () => {
      const res = await authFetch("/api/conversations");
      if (!res.ok) throw new Error("Falha ao buscar conversas");
      return res.json();
    },
  });

  useEffect(() => {
    if (tags.length > 0 && orderedTags.length === 0) {
      setOrderedTags(tags);
    } else if (tags.length > 0) {
      const newTagIds = new Set(tags.map(t => t.id));
      const existingIds = new Set(orderedTags.map(t => t.id));
      const newTags = tags.filter(t => !existingIds.has(t.id));
      const stillValidTags = orderedTags.filter(t => newTagIds.has(t.id));
      if (newTags.length > 0 || stillValidTags.length !== orderedTags.length) {
        setOrderedTags([...stillValidTags, ...newTags]);
      }
    }
  }, [tags]);

  const isLoading = tagsLoading || conversationsLoading;

  const getConversationsForTag = (tagId: string): ConversationWithDetails[] => {
    return conversations.filter(c => c.tags && c.tags.length > 0 && c.tags[0].id === tagId);
  };

  const getConversationsWithoutTag = (): ConversationWithDetails[] => {
    return conversations.filter(c => !c.tags || c.tags.length === 0);
  };

  const noTagConversations = getConversationsWithoutTag();

  const handleConversationClick = (conversation: ConversationWithDetails) => {
    setLocation(`/?conversation=${conversation.id}`);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragId = event.active.id as string;
    
    if (dragId.startsWith("column-")) {
      setActiveColumnId(dragId);
      return;
    }
    
    const conversationId = dragId.includes("_") ? dragId.split("_")[0] : dragId;
    const conv = conversations.find(c => c.id === conversationId);
    setActiveConversation(conv || null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveConversation(null);
    setActiveColumnId(null);
    if (!over || active.id === over.id) return;

    const dragId = active.id as string;
    const overId = over.id as string;

    if (dragId.startsWith("column-") && overId.startsWith("column-")) {
      const activeTagId = dragId.replace("column-", "");
      const overTagId = overId.replace("column-", "");
      
      const oldIndex = orderedTags.findIndex(t => t.id === activeTagId);
      const newIndex = orderedTags.findIndex(t => t.id === overTagId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(orderedTags, oldIndex, newIndex);
        setOrderedTags(newOrder);
        toast({ title: "Colunas reordenadas" });
      }
      return;
    }

    const conversationId = dragId.includes("_") ? dragId.split("_")[0] : dragId;
    let newTagId = overId;

    if (newTagId.includes("_")) {
      newTagId = newTagId.split("_")[1];
    }
    
    if (newTagId.startsWith("column-")) {
      newTagId = newTagId.replace("column-", "");
    }

    const conversation = conversations?.find(c => c.id === conversationId);
    if (!conversation) return;

    const oldTagId = conversation.tags?.[0]?.id;

    if (oldTagId === newTagId) return;

    try {
      if (oldTagId && oldTagId !== "no-tag") {
        await apiRequest("DELETE", `/api/contacts/${conversation.contactId}/tags/${oldTagId}`);
      }

      if (newTagId !== "no-tag") {
        await apiRequest("POST", `/api/contacts/${conversation.contactId}/tags`, { tagId: newTagId });
      }

      await queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: "Etiqueta atualizada" });
    } catch (error) {
      toast({ title: "Erro ao mover", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-hidden">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Pipeline de Conversas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Arraste as conversas entre as etiquetas para organizar seu atendimento. As etiquetas são atualizadas automaticamente.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant={showTimeInStage ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const newValue = !showTimeInStage;
                setShowTimeInStage(newValue);
                localStorage.setItem("kanban-show-time", String(newValue));
              }}
              data-testid="button-toggle-time"
              title={showTimeInStage ? "Ocultar tempo no estágio" : "Mostrar tempo no estágio"}
            >
              <Clock className="h-4 w-4 mr-2" />
              {showTimeInStage ? "Ocultar Tempo" : "Mostrar Tempo"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/settings/tags")}
              data-testid="button-manage-tags"
            >
              <Settings className="h-4 w-4 mr-2" />
              Gerenciar Etiquetas
            </Button>
          </div>
        </div>

        {isLoading ? (
          <LoadingCard />
        ) : tags.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={TagIcon}
                title="Nenhuma etiqueta configurada"
                description="Crie etiquetas em Configurações > Etiquetas para configurar seu pipeline"
                action={
                  <Button onClick={() => setLocation("/settings/tags")} data-testid="button-create-tags">
                    <TagIcon className="h-4 w-4 mr-2" />
                    Criar Etiquetas
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={orderedTags.map(t => `column-${t.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-4 h-[calc(100vh-180px)] overflow-x-auto pb-4">
                <div className="w-72 shrink-0 flex flex-col bg-muted/30 rounded-lg">
                  <div className="p-3 border-b flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm text-muted-foreground">Sem Etiqueta</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {noTagConversations.length}
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    <SortableContext
                      id="no-tag"
                      items={noTagConversations.map(c => `${c.id}_no-tag`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2 min-h-[100px]" data-tag-id="no-tag">
                        {noTagConversations.map((conv) => (
                          <SortableConversationCard
                            key={`${conv.id}_no-tag`}
                            uniqueId={`${conv.id}_no-tag`}
                            conversation={conv}
                            onClick={() => handleConversationClick(conv)}
                            showTime={showTimeInStage}
                          />
                        ))}
                        {noTagConversations.length === 0 && (
                          <div 
                            className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg"
                            data-testid="tag-drop-no-tag"
                          >
                            Arraste conversas aqui
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </ScrollArea>
                </div>

                {orderedTags.map((tag) => (
                  <SortableTagColumn
                    key={tag.id}
                    tag={tag}
                    conversations={getConversationsForTag(tag.id)}
                    onConversationClick={handleConversationClick}
                    showTime={showTimeInStage}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeConversation ? (
                <ConversationCard conversation={activeConversation} />
              ) : activeColumnId ? (
                <div className="w-72 h-20 bg-muted/50 rounded-lg border-2 border-dashed border-primary/50 flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">Movendo coluna...</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </DashboardLayout>
  );
}
