import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, GitBranch, MessageCircle, List, TextCursor, Play, GripVertical, X } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { ChatFlow, ChatFlowStep, WhatsappAccount, Tag, User } from "@shared/schema";

type ChatFlowWithSteps = ChatFlow & { steps?: ChatFlowStep[] };

const stepTypes = [
  { value: "message", label: "Enviar Mensagem", icon: MessageCircle },
  { value: "menu", label: "Menu de Opções", icon: List },
  { value: "input", label: "Capturar Dados", icon: TextCursor },
  { value: "action", label: "Executar Ação", icon: Play },
];

const inputFields = [
  { value: "nome", label: "Nome" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "outro", label: "Outro" },
];

const actionTypes = [
  { value: "assign_agent", label: "Atribuir Atendente" },
  { value: "add_tag", label: "Adicionar Etiqueta" },
  { value: "set_status", label: "Alterar Status" },
  { value: "end_flow", label: "Encerrar Fluxo" },
];

const statusOptions = [
  { value: "open", label: "Aberto" },
  { value: "pending", label: "Pendente" },
  { value: "resolved", label: "Resolvido" },
];

const flowFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  whatsappAccountId: z.string().optional(),
  triggerOnFirstMessage: z.boolean().default(true),
  triggerKeywords: z.string().optional(),
});

type FlowFormData = z.infer<typeof flowFormSchema>;

const menuOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  nextStepId: z.string().optional(),
  tagId: z.string().optional(),
  assignUserId: z.string().optional(),
});

const stepFormSchema = z.object({
  type: z.enum(["message", "menu", "input", "action"]),
  message: z.string().optional(),
  menuOptions: z.array(menuOptionSchema).optional(),
  inputField: z.string().optional(),
  actionType: z.string().optional(),
  actionPayload: z.object({
    userId: z.string().optional(),
    tagId: z.string().optional(),
    status: z.string().optional(),
  }).optional(),
  nextStepId: z.string().optional(),
});

type StepFormData = z.infer<typeof stepFormSchema>;

interface SortableStepItemProps {
  step: ChatFlowStep;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableStepItem({ step, onEdit, onDelete }: SortableStepItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const stepType = stepTypes.find(t => t.value === step.type);
  const Icon = stepType?.icon || MessageCircle;

  const getPreview = () => {
    if (step.type === "message" && step.message) {
      return step.message.length > 50 ? step.message.substring(0, 50) + "..." : step.message;
    }
    if (step.type === "menu") {
      const options = step.menuOptions as Array<{ label: string }> || [];
      return `${options.length} opções`;
    }
    if (step.type === "input") {
      return step.inputField || "Campo personalizado";
    }
    if (step.type === "action") {
      return step.actionType || "Ação";
    }
    return "";
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
        data-testid={`drag-handle-step-${step.id}`}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="p-1.5 rounded bg-muted shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{stepType?.label || step.type}</p>
          <p className="text-xs text-muted-foreground truncate">{getPreview()}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={onEdit}
          data-testid={`button-edit-step-${step.id}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          data-testid={`button-delete-step-${step.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StepItemOverlay({ step }: { step: ChatFlowStep }) {
  const stepType = stepTypes.find(t => t.value === step.type);
  const Icon = stepType?.icon || MessageCircle;

  return (
    <div className="flex items-center gap-3 p-3 bg-card border rounded-lg shadow-lg">
      <GripVertical className="h-5 w-5 text-muted-foreground" />
      <div className="p-1.5 rounded bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="font-medium text-sm">{stepType?.label || step.type}</span>
    </div>
  );
}

export default function ChatFlowsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isFlowDialogOpen, setIsFlowDialogOpen] = useState(false);
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ChatFlowWithSteps | null>(null);
  const [editingStep, setEditingStep] = useState<ChatFlowStep | null>(null);
  const [deleteConfirmFlow, setDeleteConfirmFlow] = useState<ChatFlow | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<ChatFlowStep | null>(null);
  const [activeStep, setActiveStep] = useState<ChatFlowStep | null>(null);
  const [selectedFlowForSteps, setSelectedFlowForSteps] = useState<ChatFlowWithSteps | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const flowForm = useForm<FlowFormData>({
    resolver: zodResolver(flowFormSchema),
    defaultValues: {
      name: "",
      description: "",
      isActive: true,
      whatsappAccountId: "",
      triggerOnFirstMessage: true,
      triggerKeywords: "",
    },
  });

  const stepForm = useForm<StepFormData>({
    resolver: zodResolver(stepFormSchema),
    defaultValues: {
      type: "message",
      message: "",
      menuOptions: [],
      inputField: "",
      actionType: "",
      actionPayload: {},
      nextStepId: "",
    },
  });

  const { fields: menuOptionFields, append: appendMenuOption, remove: removeMenuOption } = useFieldArray({
    control: stepForm.control,
    name: "menuOptions",
  });

  const { data: flows = [], isLoading } = useQuery<ChatFlow[]>({
    queryKey: ["/api/chat-flows"],
    queryFn: async () => {
      const res = await authFetch("/api/chat-flows");
      if (!res.ok) throw new Error("Falha ao buscar fluxos");
      return res.json();
    },
  });

  const { data: accounts = [] } = useQuery<WhatsappAccount[]>({
    queryKey: ["/api/whatsapp-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/whatsapp-accounts");
      if (!res.ok) throw new Error("Falha ao buscar contas");
      return res.json();
    },
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Falha ao buscar etiquetas");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await authFetch("/api/users");
      if (!res.ok) throw new Error("Falha ao buscar usuários");
      return res.json();
    },
  });

  const createFlow = useMutation({
    mutationFn: async (data: FlowFormData) => {
      const payload = {
        ...data,
        whatsappAccountId: data.whatsappAccountId === "all" ? null : data.whatsappAccountId || null,
        triggerKeywords: data.triggerKeywords ? data.triggerKeywords.split(",").map(k => k.trim()).filter(Boolean) : [],
      };
      const res = await apiRequest("POST", "/api/chat-flows", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-flows"] });
      setIsFlowDialogOpen(false);
      flowForm.reset();
      toast({ title: "Fluxo criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao criar fluxo", variant: "destructive" });
    },
  });

  const updateFlow = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FlowFormData }) => {
      const payload = {
        ...data,
        whatsappAccountId: data.whatsappAccountId === "all" ? null : data.whatsappAccountId || null,
        triggerKeywords: data.triggerKeywords ? data.triggerKeywords.split(",").map(k => k.trim()).filter(Boolean) : [],
      };
      const res = await apiRequest("PUT", `/api/chat-flows/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-flows"] });
      setIsFlowDialogOpen(false);
      setEditingFlow(null);
      flowForm.reset();
      toast({ title: "Fluxo atualizado com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao atualizar fluxo", variant: "destructive" });
    },
  });

  const deleteFlow = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/chat-flows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-flows"] });
      setDeleteConfirmFlow(null);
      if (selectedFlowForSteps?.id === deleteConfirmFlow?.id) {
        setSelectedFlowForSteps(null);
      }
      toast({ title: "Fluxo excluído com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir fluxo", variant: "destructive" });
    },
  });

  const toggleFlow = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/chat-flows/${id}/toggle`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-flows"] });
    },
    onError: () => {
      toast({ title: "Falha ao alterar status", variant: "destructive" });
    },
  });

  const { data: flowWithSteps, isLoading: isLoadingSteps } = useQuery<ChatFlowWithSteps>({
    queryKey: ["/api/chat-flows", selectedFlowForSteps?.id],
    queryFn: async () => {
      if (!selectedFlowForSteps) throw new Error("No flow selected");
      const res = await authFetch(`/api/chat-flows/${selectedFlowForSteps.id}`);
      if (!res.ok) throw new Error("Falha ao buscar fluxo");
      return res.json();
    },
    enabled: !!selectedFlowForSteps,
  });

  const createStep = useMutation({
    mutationFn: async (data: StepFormData & { flowId: string }) => {
      const { flowId, ...stepData } = data;
      const res = await apiRequest("POST", `/api/chat-flows/${flowId}/steps`, stepData);
      return res.json();
    },
    onSuccess: () => {
      if (selectedFlowForSteps) {
        queryClient.invalidateQueries({ queryKey: ["/api/chat-flows", selectedFlowForSteps.id] });
      }
      setIsStepDialogOpen(false);
      stepForm.reset();
      toast({ title: "Passo criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao criar passo", variant: "destructive" });
    },
  });

  const updateStep = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: StepFormData }) => {
      const res = await apiRequest("PUT", `/api/chat-flow-steps/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      if (selectedFlowForSteps) {
        queryClient.invalidateQueries({ queryKey: ["/api/chat-flows", selectedFlowForSteps.id] });
      }
      setIsStepDialogOpen(false);
      setEditingStep(null);
      stepForm.reset();
      toast({ title: "Passo atualizado com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao atualizar passo", variant: "destructive" });
    },
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/chat-flow-steps/${id}`);
    },
    onSuccess: () => {
      if (selectedFlowForSteps) {
        queryClient.invalidateQueries({ queryKey: ["/api/chat-flows", selectedFlowForSteps.id] });
      }
      setDeleteConfirmStep(null);
      toast({ title: "Passo excluído com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir passo", variant: "destructive" });
    },
  });

  const reorderSteps = useMutation({
    mutationFn: async ({ flowId, stepIds }: { flowId: string; stepIds: string[] }) => {
      const res = await apiRequest("PUT", `/api/chat-flows/${flowId}/steps/reorder`, { stepIds });
      return res.json();
    },
    onSuccess: () => {
      if (selectedFlowForSteps) {
        queryClient.invalidateQueries({ queryKey: ["/api/chat-flows", selectedFlowForSteps.id] });
      }
    },
    onError: () => {
      toast({ title: "Falha ao reordenar passos", variant: "destructive" });
    },
  });

  const handleOpenFlowDialog = (flow?: ChatFlow) => {
    if (flow) {
      setEditingFlow(flow);
      flowForm.reset({
        name: flow.name,
        description: flow.description || "",
        isActive: flow.isActive,
        whatsappAccountId: flow.whatsappAccountId || "all",
        triggerOnFirstMessage: flow.triggerOnFirstMessage,
        triggerKeywords: (flow.triggerKeywords || []).join(", "),
      });
    } else {
      setEditingFlow(null);
      flowForm.reset({
        name: "",
        description: "",
        isActive: true,
        whatsappAccountId: "all",
        triggerOnFirstMessage: true,
        triggerKeywords: "",
      });
    }
    setIsFlowDialogOpen(true);
  };

  const handleFlowSubmit = (data: FlowFormData) => {
    if (editingFlow) {
      updateFlow.mutate({ id: editingFlow.id, data });
    } else {
      createFlow.mutate(data);
    }
  };

  const handleOpenStepDialog = (step?: ChatFlowStep) => {
    if (step) {
      setEditingStep(step);
      const menuOptions = (step.menuOptions as Array<{ value: string; label: string; nextStepId?: string; tagId?: string; assignUserId?: string }>) || [];
      const actionPayload = (step.actionPayload as { userId?: string; tagId?: string; status?: string }) || {};
      stepForm.reset({
        type: step.type as "message" | "menu" | "input" | "action",
        message: step.message || "",
        menuOptions: menuOptions,
        inputField: step.inputField || "",
        actionType: step.actionType || "",
        actionPayload: actionPayload,
        nextStepId: step.nextStepId || "",
      });
    } else {
      setEditingStep(null);
      stepForm.reset({
        type: "message",
        message: "",
        menuOptions: [],
        inputField: "",
        actionType: "",
        actionPayload: {},
        nextStepId: "",
      });
    }
    setIsStepDialogOpen(true);
  };

  const handleStepSubmit = (data: StepFormData) => {
    if (editingStep) {
      updateStep.mutate({ id: editingStep.id, data });
    } else if (selectedFlowForSteps) {
      createStep.mutate({ ...data, flowId: selectedFlowForSteps.id });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const steps = flowWithSteps?.steps || [];
    const step = steps.find(s => s.id === event.active.id);
    setActiveStep(step || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveStep(null);

    if (over && active.id !== over.id && selectedFlowForSteps && flowWithSteps?.steps) {
      const steps = flowWithSteps.steps;
      const oldIndex = steps.findIndex(s => s.id === active.id);
      const newIndex = steps.findIndex(s => s.id === over.id);
      const newOrder = arrayMove(steps, oldIndex, newIndex);
      reorderSteps.mutate({
        flowId: selectedFlowForSteps.id,
        stepIds: newOrder.map(s => s.id),
      });
    }
  };

  const stepType = stepForm.watch("type");
  const steps = flowWithSteps?.steps || [];

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold">Fluxos Conversacionais</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure fluxos automáticos para atender seus clientes
              </p>
            </div>
            <Button onClick={() => handleOpenFlowDialog()} data-testid="button-create-flow">
              <Plus className="h-4 w-4 mr-2" />
              Novo Fluxo
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="font-medium mb-3">Fluxos</h2>
              {isLoading ? (
                <LoadingCard />
              ) : flows.length === 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <EmptyState
                      icon={GitBranch}
                      title="Nenhum fluxo"
                      description="Crie seu primeiro fluxo para automatizar atendimentos"
                      action={
                        <Button onClick={() => handleOpenFlowDialog()} data-testid="button-create-first-flow">
                          <Plus className="h-4 w-4 mr-2" />
                          Criar Fluxo
                        </Button>
                      }
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {flows.map((flow) => (
                    <Card
                      key={flow.id}
                      className={`cursor-pointer transition-colors ${
                        selectedFlowForSteps?.id === flow.id ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedFlowForSteps(flow)}
                      data-testid={`card-flow-${flow.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-sm truncate">{flow.name}</h3>
                              <Badge variant={flow.isActive ? "default" : "secondary"} className="shrink-0">
                                {flow.isActive ? "Ativo" : "Inativo"}
                              </Badge>
                            </div>
                            {flow.description && (
                              <p className="text-xs text-muted-foreground truncate">{flow.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch
                              checked={flow.isActive}
                              onCheckedChange={() => toggleFlow.mutate(flow.id)}
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`switch-toggle-${flow.id}`}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFlowDialog(flow);
                              }}
                              data-testid={`button-edit-flow-${flow.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmFlow(flow);
                              }}
                              data-testid={`button-delete-flow-${flow.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="font-medium mb-3">
                Passos {selectedFlowForSteps ? `- ${selectedFlowForSteps.name}` : ""}
              </h2>
              {!selectedFlowForSteps ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    Selecione um fluxo para editar seus passos
                  </CardContent>
                </Card>
              ) : isLoadingSteps ? (
                <LoadingCard />
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">
                        Passos ({steps.length})
                      </CardTitle>
                      <Button
                        size="sm"
                        onClick={() => handleOpenStepDialog()}
                        data-testid="button-add-step"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Passo
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {steps.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                        Nenhum passo adicionado
                      </p>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={steps.map(s => s.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {steps.map((step) => (
                              <SortableStepItem
                                key={step.id}
                                step={step}
                                onEdit={() => handleOpenStepDialog(step)}
                                onDelete={() => setDeleteConfirmStep(step)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                        <DragOverlay>
                          {activeStep ? <StepItemOverlay step={activeStep} /> : null}
                        </DragOverlay>
                      </DndContext>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isFlowDialogOpen} onOpenChange={setIsFlowDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFlow ? "Editar Fluxo" : "Novo Fluxo"}</DialogTitle>
            <DialogDescription>
              {editingFlow
                ? "Atualize as configurações do fluxo."
                : "Configure o fluxo conversacional."}
            </DialogDescription>
          </DialogHeader>
          <Form {...flowForm}>
            <form onSubmit={flowForm.handleSubmit(handleFlowSubmit)} className="space-y-4">
              <FormField
                control={flowForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: Atendimento Inicial"
                        data-testid="input-flow-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={flowForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Descreva o objetivo do fluxo"
                        className="min-h-20"
                        data-testid="input-flow-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={flowForm.control}
                name="whatsappAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta WhatsApp</FormLabel>
                    <Select value={field.value || "all"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-whatsapp-account">
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">Todas as contas</SelectItem>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name} ({acc.phoneNumber})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={flowForm.control}
                name="triggerOnFirstMessage"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Disparar na primeira mensagem</FormLabel>
                      <FormDescription className="text-xs">
                        Iniciar fluxo quando o cliente enviar a primeira mensagem
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-trigger-first-message"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={flowForm.control}
                name="triggerKeywords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Palavras-chave (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: oi, olá, bom dia"
                        data-testid="input-trigger-keywords"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Separadas por vírgula. O fluxo inicia quando uma dessas palavras é recebida.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={flowForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Fluxo Ativo</FormLabel>
                      <FormDescription className="text-xs">
                        Apenas fluxos ativos serão executados
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-flow-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsFlowDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createFlow.isPending || updateFlow.isPending}
                  data-testid="button-save-flow"
                >
                  {createFlow.isPending || updateFlow.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStep ? "Editar Passo" : "Novo Passo"}</DialogTitle>
            <DialogDescription>
              Configure o passo do fluxo.
            </DialogDescription>
          </DialogHeader>
          <Form {...stepForm}>
            <form onSubmit={stepForm.handleSubmit(handleStepSubmit)} className="space-y-4">
              <FormField
                control={stepForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo do Passo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-step-type">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stepTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-4 w-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {stepType === "message" && (
                <>
                  <FormField
                    control={stepForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mensagem</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Digite a mensagem que será enviada..."
                            className="min-h-24"
                            data-testid="input-step-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={stepForm.control}
                    name="nextStepId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Próximo Passo</FormLabel>
                        <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-next-step">
                              <SelectValue placeholder="Selecione o próximo passo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Nenhum (fim do fluxo)</SelectItem>
                            {steps.filter(s => s.id !== editingStep?.id).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {stepTypes.find(t => t.value === s.type)?.label || s.type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {stepType === "menu" && (
                <>
                  <FormField
                    control={stepForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mensagem do Menu</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Ex: Escolha uma opção digitando o número..."
                            className="min-h-20"
                            data-testid="input-menu-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel>Opções do Menu</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendMenuOption({ value: String(menuOptionFields.length + 1), label: "" })}
                        data-testid="button-add-menu-option"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                      </Button>
                    </div>

                    {menuOptionFields.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                        Nenhuma opção adicionada
                      </p>
                    )}

                    {menuOptionFields.map((field, index) => (
                      <div key={field.id} className="p-3 border rounded-lg space-y-3 bg-muted/30">
                        <div className="flex items-center gap-2">
                          <FormField
                            control={stepForm.control}
                            name={`menuOptions.${index}.value`}
                            render={({ field }) => (
                              <FormItem className="w-16">
                                <FormControl>
                                  <Input {...field} placeholder="#" data-testid={`input-option-value-${index}`} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={stepForm.control}
                            name={`menuOptions.${index}.label`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input {...field} placeholder="Descrição da opção" data-testid={`input-option-label-${index}`} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeMenuOption(index)}
                            data-testid={`button-remove-option-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <FormField
                            control={stepForm.control}
                            name={`menuOptions.${index}.nextStepId`}
                            render={({ field }) => (
                              <FormItem>
                                <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                                  <FormControl>
                                    <SelectTrigger className="text-xs">
                                      <SelectValue placeholder="Próx. passo" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">Nenhum</SelectItem>
                                    {steps.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {stepTypes.find(t => t.value === s.type)?.label || s.type}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={stepForm.control}
                            name={`menuOptions.${index}.tagId`}
                            render={({ field }) => (
                              <FormItem>
                                <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                                  <FormControl>
                                    <SelectTrigger className="text-xs">
                                      <SelectValue placeholder="Etiqueta" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">Nenhuma</SelectItem>
                                    {tags.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                                          {t.name}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={stepForm.control}
                            name={`menuOptions.${index}.assignUserId`}
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                                  <FormControl>
                                    <SelectTrigger className="text-xs">
                                      <SelectValue placeholder="Atribuir atendente" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">Nenhum</SelectItem>
                                    {users.map((u) => (
                                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {stepType === "input" && (
                <>
                  <FormField
                    control={stepForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mensagem de Solicitação</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Ex: Por favor, informe seu nome:"
                            className="min-h-20"
                            data-testid="input-request-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={stepForm.control}
                    name="inputField"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campo a Capturar</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-input-field">
                              <SelectValue placeholder="Selecione o campo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {inputFields.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={stepForm.control}
                    name="nextStepId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Próximo Passo</FormLabel>
                        <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-input-next-step">
                              <SelectValue placeholder="Selecione o próximo passo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Nenhum (fim do fluxo)</SelectItem>
                            {steps.filter(s => s.id !== editingStep?.id).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {stepTypes.find(t => t.value === s.type)?.label || s.type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {stepType === "action" && (
                <>
                  <FormField
                    control={stepForm.control}
                    name="actionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Ação</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-action-type">
                              <SelectValue placeholder="Selecione a ação" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {actionTypes.map((a) => (
                              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {stepForm.watch("actionType") === "assign_agent" && (
                    <FormField
                      control={stepForm.control}
                      name="actionPayload.userId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Atendente</FormLabel>
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-action-user">
                                <SelectValue placeholder="Selecione o atendente" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {stepForm.watch("actionType") === "add_tag" && (
                    <FormField
                      control={stepForm.control}
                      name="actionPayload.tagId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Etiqueta</FormLabel>
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-action-tag">
                                <SelectValue placeholder="Selecione a etiqueta" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {tags.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                                    {t.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {stepForm.watch("actionType") === "set_status" && (
                    <FormField
                      control={stepForm.control}
                      name="actionPayload.status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-action-status">
                                <SelectValue placeholder="Selecione o status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {statusOptions.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={stepForm.control}
                    name="nextStepId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Próximo Passo</FormLabel>
                        <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-action-next-step">
                              <SelectValue placeholder="Selecione o próximo passo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Nenhum (fim do fluxo)</SelectItem>
                            {steps.filter(s => s.id !== editingStep?.id).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {stepTypes.find(t => t.value === s.type)?.label || s.type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsStepDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createStep.isPending || updateStep.isPending}
                  data-testid="button-save-step"
                >
                  {createStep.isPending || updateStep.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmFlow} onOpenChange={() => setDeleteConfirmFlow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o fluxo "{deleteConfirmFlow?.name}"?
              Todos os passos serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmFlow && deleteFlow.mutate(deleteConfirmFlow.id)}
              data-testid="button-confirm-delete-flow"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirmStep} onOpenChange={() => setDeleteConfirmStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir passo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este passo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmStep && deleteStep.mutate(deleteConfirmStep.id)}
              data-testid="button-confirm-delete-step"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
