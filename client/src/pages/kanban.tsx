import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, Phone, MessageSquare, Settings, Tag as TagIcon, Clock, Eye, EyeOff, Bot, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "./dashboard";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingCard, LoadingSpinner } from "@/components/loading-spinner";
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
import { GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPhoneNumber, cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Tag, ConversationWithDetails, Robot } from "@shared/schema";

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

interface RobotPopoverProps {
  conversationId: string;
  robots: Robot[];
  onSuccess: () => void;
}

function RobotPopover({ conversationId, robots, onSuccess }: RobotPopoverProps) {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  const activeRobots = robots.filter(r => r.isActive);
  const filteredRobots = searchTerm
    ? activeRobots.filter(r => 
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : activeRobots;

  const handleExecuteRobot = async (robot: Robot, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExecuting(true);
    
    try {
      const res = await authFetch("/api/robots/execute", {
        method: "POST",
        body: JSON.stringify({ robotId: robot.id, conversationId }),
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Falha ao executar robo" }));
        throw new Error(error.message);
      }

      const result = await res.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/items"] });

      if (result.queuedAt) {
        toast({ title: `Robo "${robot.name}" adicionado a fila anti-spam`, description: "Sera executado respeitando os delays configurados" });
      } else {
        toast({ title: `Robo "${robot.name}" executado com sucesso` });
      }
      setIsOpen(false);
      setSearchTerm("");
      onSuccess();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Falha ao executar robo", variant: "destructive" });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          data-testid={`button-robot-${conversationId}`}
          title="Executar Robo"
        >
          <Bot className="h-3 w-3 text-emerald-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-2" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar robo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8"
              data-testid="input-robot-search"
            />
          </div>
          <ScrollArea className="max-h-60">
            <div className="space-y-1">
              {filteredRobots.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {activeRobots.length === 0 ? "Nenhum robo ativo configurado" : "Nenhum robo encontrado"}
                </p>
              ) : (
                filteredRobots.map((robot) => (
                  <button
                    key={robot.id}
                    className="w-full text-left px-2 py-2 rounded-md hover-elevate active-elevate-2 transition-colors"
                    onClick={(e) => handleExecuteRobot(robot, e)}
                    disabled={isExecuting}
                    data-testid={`robot-option-${robot.id}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="h-4 w-4 text-emerald-500" />
                      <span className="font-medium text-sm">{robot.name}</span>
                      {isExecuting && <LoadingSpinner size="sm" />}
                    </div>
                    {robot.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {robot.description}
                      </p>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {(robot.actions as any[]).length} acoes
                    </span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SortableConversationCardProps {
  conversation: ConversationWithDetails;
  onClick: () => void;
  uniqueId: string;
  showTime?: boolean;
  robots: Robot[];
  isInQueue?: boolean;
}

function SortableConversationCard({ conversation, onClick, uniqueId, showTime, robots, isInQueue }: SortableConversationCardProps) {
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
              <div className="flex items-center gap-1 shrink-0">
                <RobotPopover
                  conversationId={conversation.id}
                  robots={robots}
                  onSuccess={() => {}}
                />
                {showTime && timeInStage && (
                  <span className={cn("text-xs font-medium flex items-center gap-0.5", timeColor)}>
                    <Clock className="h-3 w-3" />
                    {timeInStage}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {formatPhoneNumber(conversation.contact.phoneNumber)}
            </p>
          </div>
        </div>
        {isInQueue && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
              <Bot className="h-3 w-3 mr-1" />
              Na Fila
            </Badge>
          </div>
        )}
        {conversation.tags && conversation.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {conversation.tags.slice(0, 3).map((tag, idx) => (
              <Badge
                key={`${conversation.id}-tag-${idx}-${tag.id}`}
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
  robots: Robot[];
  queuedConversationIds: Set<string>;
}

function SortableTagColumn({ tag, conversations, onConversationClick, showTime, robots, queuedConversationIds }: TagColumnProps) {
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
                robots={robots}
                isInQueue={queuedConversationIds.has(conv.id)}
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
  const isMobile = useIsMobile();
  const [activeConversation, setActiveConversation] = useState<ConversationWithDetails | null>(null);
  const [orderedTags, setOrderedTags] = useState<Tag[]>([]);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [mobileColumnIndex, setMobileColumnIndex] = useState(0);
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

  const { data: rawConversations = [], isLoading: conversationsLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/conversations"],
    queryFn: async () => {
      const res = await authFetch("/api/conversations");
      if (!res.ok) throw new Error("Falha ao buscar conversas");
      return res.json();
    },
  });

  // Deduplicar conversas (evita chaves duplicadas no React)
  const conversations = rawConversations.filter((conv, index, self) => 
    self.findIndex(c => c.id === conv.id) === index
  );

  const { data: robots = [] } = useQuery<Robot[]>({
    queryKey: ["/api/robots"],
    queryFn: async () => {
      const res = await authFetch("/api/robots");
      if (!res.ok) throw new Error("Falha ao buscar robos");
      return res.json();
    },
  });

  const { data: queueItems = [] } = useQuery<{ conversationId: string; status: string }[]>({
    queryKey: ["/api/robot-queue/items", "active"],
    queryFn: async () => {
      const res = await authFetch("/api/robot-queue/items");
      if (!res.ok) return [];
      const items = await res.json();
      return items.filter((item: any) => item.status === "pending" || item.status === "processing");
    },
    refetchInterval: 3000,
  });

  const queuedConversationIds = new Set(
    queueItems.filter(item => item.status === "pending" || item.status === "processing").map(item => item.conversationId)
  );

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

  // All columns for mobile navigation (apenas tags - sem etiqueta não aparece no kanban)
  const allColumns = orderedTags.map(tag => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    conversations: getConversationsForTag(tag.id),
  }));

  const currentMobileColumn = allColumns[mobileColumnIndex] || allColumns[0];

  return (
    <DashboardLayout>
      <div className={cn("flex-1 overflow-hidden", isMobile ? "p-3" : "p-6")}>
        <div className={cn("mb-4 flex items-center justify-between gap-3", isMobile && "flex-col items-start")}>
          <div>
            <h1 className={cn("font-semibold", isMobile ? "text-lg" : "text-2xl")}>Pipeline de Conversas</h1>
            {!isMobile && (
              <p className="text-sm text-muted-foreground mt-1">
                Arraste as conversas entre as etiquetas para organizar seu atendimento. As etiquetas são atualizadas automaticamente.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
              <Clock className="h-4 w-4" />
              {!isMobile && <span className="ml-2">{showTimeInStage ? "Ocultar Tempo" : "Mostrar Tempo"}</span>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/settings/tags")}
              data-testid="button-manage-tags"
            >
              <Settings className="h-4 w-4" />
              {!isMobile && <span className="ml-2">Gerenciar Etiquetas</span>}
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
        ) : isMobile ? (
          /* Mobile View - One column at a time with navigation */
          <div className="flex flex-col h-[calc(100vh-160px)]">
            {/* Column navigation header */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMobileColumnIndex(Math.max(0, mobileColumnIndex - 1))}
                disabled={mobileColumnIndex === 0}
                data-testid="button-prev-column"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex-1 flex items-center justify-center gap-2">
                {currentMobileColumn.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentMobileColumn.color }}
                  />
                )}
                {!currentMobileColumn.color && (
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="font-medium text-sm truncate">{currentMobileColumn.name}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {currentMobileColumn.conversations.length}
                </Badge>
              </div>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMobileColumnIndex(Math.min(allColumns.length - 1, mobileColumnIndex + 1))}
                disabled={mobileColumnIndex === allColumns.length - 1}
                data-testid="button-next-column"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Column dots indicator */}
            <div className="flex justify-center gap-1.5 mb-3">
              {allColumns.map((col, idx) => (
                <button
                  key={col.id}
                  onClick={() => setMobileColumnIndex(idx)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    idx === mobileColumnIndex ? "bg-primary w-4" : "bg-muted-foreground/30"
                  )}
                  data-testid={`dot-column-${idx}`}
                />
              ))}
            </div>

            {/* Column content */}
            <div 
              className="flex-1 bg-muted/30 rounded-lg overflow-hidden flex flex-col"
              style={{ borderTop: currentMobileColumn.color ? `3px solid ${currentMobileColumn.color}` : undefined }}
            >
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2">
                  {currentMobileColumn.conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleConversationClick(conv)}
                      className="cursor-pointer"
                    >
                      <ConversationCard conversation={conv} />
                    </div>
                  ))}
                  {currentMobileColumn.conversations.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      Nenhuma conversa nesta etiqueta
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : (
          /* Desktop View - Full horizontal Kanban */
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
                {orderedTags.map((tag) => (
                  <SortableTagColumn
                    key={tag.id}
                    tag={tag}
                    conversations={getConversationsForTag(tag.id)}
                    onConversationClick={handleConversationClick}
                    showTime={showTimeInStage}
                    robots={robots}
                    queuedConversationIds={queuedConversationIds}
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
