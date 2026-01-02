import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, Phone, MessageSquare, Settings, Plus, Tag as TagIcon } from "lucide-react";
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
import type { Tag, ConversationWithDetails } from "@shared/schema";

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

  const addTagMutation = useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) => {
      const res = await apiRequest("POST", `/api/contacts/${contactId}/tags`, { tagId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Etiqueta adicionada com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao adicionar etiqueta", variant: "destructive" });
    },
  });

  const isLoading = tagsLoading || conversationsLoading;

  const getConversationsForTag = (tagId: string): ConversationWithDetails[] => {
    return conversations.filter(c => c.tags?.some(t => t.id === tagId));
  };

  const getConversationsWithoutTags = (): ConversationWithDetails[] => {
    return conversations.filter(c => !c.tags || c.tags.length === 0);
  };

  const noTagConversations = getConversationsWithoutTags();

  const handleConversationClick = (conversation: ConversationWithDetails) => {
    setLocation(`/?conversation=${conversation.id}`);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragId = event.active.id as string;
    const conversationId = dragId.includes("_") ? dragId.split("_")[0] : dragId;
    const conv = conversations.find(c => c.id === conversationId);
    setActiveConversation(conv || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveConversation(null);

    if (!over) return;

    const dragId = active.id as string;
    const conversationId = dragId.includes("_") ? dragId.split("_")[0] : dragId;
    const overId = over.id as string;

    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    let targetTagId: string | null = null;
    
    if (overId === "no-tag" || overId === "no-tag-drop") {
      return;
    } else if (tags.some(t => t.id === overId)) {
      targetTagId = overId;
    } else if (overId.includes("_")) {
      const tagIdFromOverId = overId.split("_")[1];
      if (tags.some(t => t.id === tagIdFromOverId)) {
        targetTagId = tagIdFromOverId;
      }
    } else {
      const targetConv = conversations.find(c => c.id === overId);
      if (targetConv && targetConv.tags && targetConv.tags.length > 0) {
        targetTagId = targetConv.tags[0].id;
      }
    }

    if (targetTagId) {
      const alreadyHasTag = conversation.tags?.some(t => t.id === targetTagId);
      if (!alreadyHasTag) {
        addTagMutation.mutate({ contactId: conversation.contactId, tagId: targetTagId });
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-hidden">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Pipeline de Conversas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Arraste as conversas entre as etiquetas para organizar seu atendimento
            </p>
          </div>
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
                    <Plus className="h-4 w-4 mr-2" />
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
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-[calc(100vh-180px)] overflow-x-auto pb-4">
              {noTagConversations.length > 0 && (
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
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </ScrollArea>
                </div>
              )}

              {tags.map((tag) => {
                const tagConversations = getConversationsForTag(tag.id);
                return (
                  <div
                    key={tag.id}
                    className="w-72 shrink-0 flex flex-col bg-muted/50 rounded-lg"
                  >
                    <div 
                      className="p-3 border-b flex items-center justify-between gap-2"
                      style={{ borderBottomColor: tag.color, borderBottomWidth: '2px' }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="font-medium text-sm truncate">{tag.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {tagConversations.length}
                      </Badge>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                      <SortableContext
                        id={tag.id}
                        items={tagConversations.map(c => `${c.id}_${tag.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2 min-h-[100px]" data-tag-id={tag.id}>
                          {tagConversations.map((conv) => (
                            <SortableConversationCard
                              key={`${conv.id}_${tag.id}`}
                              uniqueId={`${conv.id}_${tag.id}`}
                              conversation={conv}
                              onClick={() => handleConversationClick(conv)}
                            />
                          ))}
                          {tagConversations.length === 0 && (
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
              })}
            </div>

            <DragOverlay>
              {activeConversation ? (
                <ConversationCard conversation={activeConversation} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </DashboardLayout>
  );
}
