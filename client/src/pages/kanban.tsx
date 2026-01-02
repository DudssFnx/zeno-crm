import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, Phone, MessageSquare, Settings, Plus } from "lucide-react";
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Stage, ConversationWithDetails } from "@shared/schema";

interface SortableConversationCardProps {
  conversation: ConversationWithDetails;
  onClick: () => void;
}

function SortableConversationCard({ conversation, onClick }: SortableConversationCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: conversation.id });

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
              {conversation.contact.phoneNumber}
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
      </CardContent>
    </Card>
  );
}

function ConversationCard({ conversation, onClick }: SortableConversationCardProps) {
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
              {conversation.contact.phoneNumber}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function KanbanPage() {
  const authFetch = useAuthFetch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeConversation, setActiveConversation] = useState<ConversationWithDetails | null>(null);

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

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/conversations"],
    queryFn: async () => {
      const res = await authFetch("/api/conversations");
      if (!res.ok) throw new Error("Falha ao buscar conversas");
      return res.json();
    },
  });

  const updateConversationStage = useMutation({
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

  const isLoading = stagesLoading || conversationsLoading;

  const getConversationsForStage = (stageId: string | null): ConversationWithDetails[] => {
    return conversations.filter(c => c.stageId === stageId);
  };

  const unstaged = getConversationsForStage(null);

  const handleConversationClick = (conversation: ConversationWithDetails) => {
    setLocation(`/?conversation=${conversation.id}`);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const conv = conversations.find(c => c.id === event.active.id);
    setActiveConversation(conv || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveConversation(null);

    if (!over) return;

    const conversationId = active.id as string;
    const overId = over.id as string;

    let newStageId: string | null = null;
    if (overId === "unstaged") {
      newStageId = null;
    } else if (stages.some(s => s.id === overId)) {
      newStageId = overId;
    } else {
      const targetConv = conversations.find(c => c.id === overId);
      if (targetConv) {
        newStageId = targetConv.stageId;
      }
    }

    const currentConv = conversations.find(c => c.id === conversationId);
    if (currentConv && currentConv.stageId !== newStageId) {
      updateConversationStage.mutate({ conversationId, stageId: newStageId });
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-hidden">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Pipeline de Conversas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Arraste as conversas entre os estágios para atualizar o status
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
        ) : stages.length === 0 ? (
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
              {stages.map((stage) => {
                const stageConversations = getConversationsForStage(stage.id);
                return (
                  <div
                    key={stage.id}
                    className="w-72 shrink-0 flex flex-col bg-muted/50 rounded-lg"
                  >
                    <div className="p-3 border-b flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="font-medium text-sm truncate">{stage.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {stageConversations.length}
                      </Badge>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                      <SortableContext
                        id={stage.id}
                        items={stageConversations.map(c => c.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2 min-h-[100px]" data-stage-id={stage.id}>
                          {stageConversations.map((conv) => (
                            <SortableConversationCard
                              key={conv.id}
                              conversation={conv}
                              onClick={() => handleConversationClick(conv)}
                            />
                          ))}
                          {stageConversations.length === 0 && (
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
              })}

              {unstaged.length > 0 && (
                <div className="w-72 shrink-0 flex flex-col bg-muted/30 rounded-lg opacity-75">
                  <div className="p-3 border-b flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm text-muted-foreground">Sem Estágio</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {unstaged.length}
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    <SortableContext
                      id="unstaged"
                      items={unstaged.map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {unstaged.map((conv) => (
                          <SortableConversationCard
                            key={conv.id}
                            conversation={conv}
                            onClick={() => handleConversationClick(conv)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </ScrollArea>
                </div>
              )}
            </div>

            <DragOverlay>
              {activeConversation ? (
                <ConversationCard
                  conversation={activeConversation}
                  onClick={() => {}}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </DashboardLayout>
  );
}
