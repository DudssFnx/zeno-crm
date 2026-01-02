import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, GripVertical, Pencil, Trash2, LayoutGrid } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DashboardLayout } from "../dashboard";
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
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Stage } from "@shared/schema";

const PRESET_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#6B7280",
  "#14B8A6",
  "#F97316",
];

interface SortableStageItemProps {
  stage: Stage;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableStageItem({ stage, onEdit, onDelete }: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-card border rounded-lg"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground"
        data-testid={`drag-handle-${stage.id}`}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div
        className="w-4 h-4 rounded-full shrink-0"
        style={{ backgroundColor: stage.color }}
      />
      <span className="flex-1 font-medium text-sm">{stage.name}</span>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={onEdit}
          data-testid={`button-edit-${stage.id}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          data-testid={`button-delete-${stage.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StageItemOverlay({ stage }: { stage: Stage }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-lg">
      <GripVertical className="h-5 w-5 text-muted-foreground" />
      <div
        className="w-4 h-4 rounded-full shrink-0"
        style={{ backgroundColor: stage.color }}
      />
      <span className="flex-1 font-medium text-sm">{stage.name}</span>
    </div>
  );
}

export default function StagesSettingsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [deleteConfirmStage, setDeleteConfirmStage] = useState<Stage | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [activeStage, setActiveStage] = useState<Stage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: stages = [], isLoading } = useQuery<Stage[]>({
    queryKey: ["/api/stages"],
    queryFn: async () => {
      const res = await authFetch("/api/stages");
      if (!res.ok) throw new Error("Falha ao buscar estágios");
      return res.json();
    },
  });

  const createStage = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const res = await apiRequest("POST", "/api/stages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      toast({ title: "Estágio criado com sucesso" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Falha ao criar estágio", variant: "destructive" });
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; color: string } }) => {
      const res = await apiRequest("PUT", `/api/stages/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      toast({ title: "Estágio atualizado com sucesso" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Falha ao atualizar estágio", variant: "destructive" });
    },
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/stages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      toast({ title: "Estágio excluído com sucesso" });
      setDeleteConfirmStage(null);
    },
    onError: () => {
      toast({ title: "Falha ao excluir estágio", variant: "destructive" });
    },
  });

  const reorderStages = useMutation({
    mutationFn: async (stageIds: string[]) => {
      const res = await apiRequest("PUT", "/api/stages/reorder", { stageIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
    },
    onError: () => {
      toast({ title: "Falha ao reordenar estágios", variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingStage(null);
    setFormName("");
    setFormColor(PRESET_COLORS[0]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (stage: Stage) => {
    setEditingStage(stage);
    setFormName(stage.name);
    setFormColor(stage.color);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingStage(null);
    setFormName("");
    setFormColor(PRESET_COLORS[0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingStage) {
      updateStage.mutate({ id: editingStage.id, data: { name: formName, color: formColor } });
    } else {
      createStage.mutate({ name: formName, color: formColor });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const stage = stages.find(s => s.id === event.active.id);
    setActiveStage(stage || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveStage(null);

    if (over && active.id !== over.id) {
      const oldIndex = stages.findIndex(s => s.id === active.id);
      const newIndex = stages.findIndex(s => s.id === over.id);
      const newOrder = arrayMove(stages, oldIndex, newIndex);
      reorderStages.mutate(newOrder.map(s => s.id));
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold">Estágios do Pipeline</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure os estágios para organizar suas conversas no Kanban
              </p>
            </div>
            <Button onClick={openCreateDialog} data-testid="button-create-stage">
              <Plus className="h-4 w-4 mr-2" />
              Novo Estágio
            </Button>
          </div>

          {isLoading ? (
            <LoadingCard />
          ) : stages.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={LayoutGrid}
                  title="Nenhum estágio"
                  description="Crie seu primeiro estágio para começar a organizar suas conversas"
                  action={
                    <Button onClick={openCreateDialog} data-testid="button-create-first-stage">
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Estágio
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estágios ({stages.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Arraste para reordenar os estágios do pipeline
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={stages.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {stages.map((stage) => (
                        <SortableStageItem
                          key={stage.id}
                          stage={stage}
                          onEdit={() => openEditDialog(stage)}
                          onDelete={() => setDeleteConfirmStage(stage)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeStage ? <StageItemOverlay stage={activeStage} /> : null}
                  </DragOverlay>
                </DndContext>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStage ? "Editar Estágio" : "Novo Estágio"}
            </DialogTitle>
            <DialogDescription>
              {editingStage
                ? "Atualize as informações do estágio"
                : "Preencha as informações para criar um novo estágio"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  placeholder="Ex: Novo Lead, Em Negociação, Fechado"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  data-testid="input-stage-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-md border-2 transition-all ${
                        formColor === color
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormColor(color)}
                      data-testid={`color-${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!formName.trim() || createStage.isPending || updateStage.isPending}
                data-testid="button-save-stage"
              >
                {createStage.isPending || updateStage.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmStage} onOpenChange={() => setDeleteConfirmStage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir estágio?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o estágio "{deleteConfirmStage?.name}"?
              As conversas neste estágio serão movidas para "Sem Estágio".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmStage && deleteStage.mutate(deleteConfirmStage.id)}
              data-testid="button-confirm-delete"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
