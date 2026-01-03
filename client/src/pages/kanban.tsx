import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, Phone, MessageSquare, Settings, Plus, GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { formatPhoneNumber } from "@/lib/utils";
import type { Stage, ConversationWithDetails } from "@shared/schema";

interface SortableConversationCardProps {
  conversation: ConversationWithDetails;
  onClick: () => void;
  uniqueId: string;
}

function SortableConversationCard({ conversation, onClick, uniqueId }: SortableConversationCardProps) {
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
            <p className="font-medium text-sm truncate">{conversation.contact.name}</p>
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
            {conversation.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-xs"
                style={{ backgroundColor: tag.color + "20", color: tag.color }}
              >
                {tag.name}
              </Badge>
            ))}
            {conversation.tags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{conversation.tags.length - 2}
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

interface SortableColumnProps {
  stage: Stage;
  conversations: ConversationWithDetails[];
  onConversationClick: (conv: ConversationWithDetails) => void;
}

function SortableColumn({ stage, conversations, onConversationClick }: SortableColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `column-${stage.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="w-72 shrink-0 flex flex-col bg-muted/50 rounded-lg"
      data-testid={`column-${stage.id}`}
    >
      <div 
        className="p-3 border-b flex items-center justify-between gap-2"
        style={{ borderBottomColor: stage.color, borderBottomWidth: '2px' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover-elevate rounded"
            data-testid={`drag-handle-${stage.id}`}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </div>
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <span className="font-medium text-sm truncate">{stage.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          {conversations.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 p-2">
        <SortableContext
          id={stage.id}
          items={conversations.map(c => `${c.id}_${stage.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-[100px]" data-stage-id={stage.id}>
            {conversations.map((conv) => (
              <SortableConversationCard
                key={`${conv.id}_${stage.id}`}
                uniqueId={`${conv.id}_${stage.id}`}
                conversation={conv}
                onClick={() => onConversationClick(conv)}
              />
            ))}
            {conversations.length === 0 && (
              <div 
                className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg"
                data-testid={`stage-drop-${stage.id}`}
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
  const [activeColumn, setActiveColumn] = useState<Stage | null>(null);
  const [orderedStages, setOrderedStages] = useState<Stage[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: stages = [], isLoading: stagesLoading } = useQuery<Stage[]>({
    queryKey: ["/api/stages"],
    queryFn: async () => {
      const res = await authFetch("/api/stages");
      if (!res.ok) throw new Error("Falha ao buscar estágios");
      return res.json();
    },
  });

  useEffect(() => {
    if (stages.length > 0) {
      setOrderedStages(stages);
    }
  }, [stages]);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/conversations"],
    queryFn: async () => {
      const res = await authFetch("/api/conversations");
      if (!res.ok) throw new Error("Falha ao buscar conversas");
      return res.json();
    },
  });

  const updateConversationStageMutation = useMutation({
    mutationFn: async ({ conversationId, stageId }: { conversationId: string; stageId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/conversations/${conversationId}/stage`, { stageId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Conversa movida com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao mover conversa", variant: "destructive" });
    },
  });

  const reorderStagesMutation = useMutation({
    mutationFn: async (stageIds: string[]) => {
      const res = await apiRequest("PUT", "/api/stages/reorder", { stageIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      toast({ title: "Ordem das colunas atualizada" });
    },
    onError: () => {
      toast({ title: "Falha ao reordenar colunas", variant: "destructive" });
    },
  });

  const isLoading = stagesLoading || conversationsLoading;

  const getConversationsForStage = (stageId: string): ConversationWithDetails[] => {
    return conversations.filter(c => c.stageId === stageId);
  };

  const getConversationsWithoutStage = (): ConversationWithDetails[] => {
    return conversations.filter(c => !c.stageId);
  };

  const noStageConversations = getConversationsWithoutStage();

  const handleConversationClick = (conversation: ConversationWithDetails) => {
    setLocation(`/?conversation=${conversation.id}`);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragId = event.active.id as string;
    
    if (dragId.startsWith("column-")) {
      const stageId = dragId.replace("column-", "");
      const stage = orderedStages.find(s => s.id === stageId);
      setActiveColumn(stage || null);
      setActiveConversation(null);
    } else {
      const conversationId = dragId.includes("_") ? dragId.split("_")[0] : dragId;
      const conv = conversations.find(c => c.id === conversationId);
      setActiveConversation(conv || null);
      setActiveColumn(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveConversation(null);
    setActiveColumn(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId.startsWith("column-") && overId.startsWith("column-")) {
      const activeStageId = activeId.replace("column-", "");
      const overStageId = overId.replace("column-", "");
      
      if (activeStageId !== overStageId) {
        const oldIndex = orderedStages.findIndex(s => s.id === activeStageId);
        const newIndex = orderedStages.findIndex(s => s.id === overStageId);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrderedStages = arrayMove(orderedStages, oldIndex, newIndex);
          setOrderedStages(newOrderedStages);
          reorderStagesMutation.mutate(newOrderedStages.map(s => s.id));
        }
      }
      return;
    }

    const dragId = activeId;
    const conversationId = dragId.includes("_") ? dragId.split("_")[0] : dragId;

    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    let targetStageId: string | null = null;
    
    if (overId === "no-stage" || overId === "no-stage-drop") {
      targetStageId = null;
    } else if (overId.startsWith("column-")) {
      targetStageId = overId.replace("column-", "");
    } else if (orderedStages.some(s => s.id === overId)) {
      targetStageId = overId;
    } else if (overId.includes("_")) {
      const stageIdFromOverId = overId.split("_")[1];
      if (stageIdFromOverId !== "no-stage" && orderedStages.some(s => s.id === stageIdFromOverId)) {
        targetStageId = stageIdFromOverId;
      }
    } else {
      const targetConv = conversations.find(c => c.id === overId);
      if (targetConv && targetConv.stageId) {
        targetStageId = targetConv.stageId;
      }
    }

    if (targetStageId !== conversation.stageId) {
      updateConversationStageMutation.mutate({ 
        conversationId: conversation.id, 
        stageId: targetStageId 
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-hidden">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Pipeline de Conversas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Arraste as conversas entre os estágios para organizar seu atendimento. As tags são atualizadas automaticamente.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/settings/stages")}
            data-testid="button-manage-stages"
          >
            <Settings className="h-4 w-4 mr-2" />
            Gerenciar Estágios
          </Button>
        </div>

        {isLoading ? (
          <LoadingCard />
        ) : orderedStages.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={LayoutGrid}
                title="Nenhum estágio configurado"
                description="Crie estágios em Configurações > Estágios para configurar seu pipeline"
                action={
                  <Button onClick={() => setLocation("/settings/stages")} data-testid="button-create-stages">
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Estágios
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
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-[calc(100vh-180px)] overflow-x-auto pb-4">
              {noStageConversations.length > 0 && (
                <div className="w-72 shrink-0 flex flex-col bg-muted/30 rounded-lg">
                  <div className="p-3 border-b flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm text-muted-foreground">Sem Estágio</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {noStageConversations.length}
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    <SortableContext
                      id="no-stage"
                      items={noStageConversations.map(c => `${c.id}_no-stage`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2 min-h-[100px]" data-stage-id="no-stage">
                        {noStageConversations.map((conv) => (
                          <SortableConversationCard
                            key={`${conv.id}_no-stage`}
                            uniqueId={`${conv.id}_no-stage`}
                            conversation={conv}
                            onClick={() => handleConversationClick(conv)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </ScrollArea>
                </div>
              )}

              <SortableContext
                items={orderedStages.map(s => `column-${s.id}`)}
                strategy={horizontalListSortingStrategy}
              >
                {orderedStages.map((stage) => (
                  <SortableColumn
                    key={stage.id}
                    stage={stage}
                    conversations={getConversationsForStage(stage.id)}
                    onConversationClick={handleConversationClick}
                  />
                ))}
              </SortableContext>
            </div>

            <DragOverlay>
              {activeConversation ? (
                <ConversationCard conversation={activeConversation} />
              ) : activeColumn ? (
                <div className="w-72 h-32 bg-muted/50 rounded-lg border-2 border-dashed flex items-center justify-center">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: activeColumn.color }}
                    />
                    <span className="font-medium text-sm">{activeColumn.name}</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </DashboardLayout>
  );
}
