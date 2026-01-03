import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Bot, GripVertical, Clock, MessageSquare, Mic, Play, Pause, Tag as TagIcon, UserCircle, Image, FileText, Video, ArrowRight, Upload, X } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Robot, Tag, User } from "@shared/schema";

const actionTypes = [
  { value: "send_text", label: "Enviar Texto", icon: MessageSquare },
  { value: "send_image", label: "Enviar Imagem", icon: Image },
  { value: "send_audio", label: "Enviar Audio", icon: Mic },
  { value: "send_video", label: "Enviar Video", icon: Video },
  { value: "send_document", label: "Enviar Documento", icon: FileText },
  { value: "simulate_typing", label: "Simular Digitando", icon: MessageSquare },
  { value: "simulate_recording", label: "Simular Gravando", icon: Mic },
  { value: "delay", label: "Aguardar", icon: Clock },
  { value: "add_tag", label: "Adicionar Etiqueta", icon: TagIcon },
  { value: "remove_tag", label: "Remover Etiqueta", icon: TagIcon },
  { value: "remove_all_tags", label: "Remover Todas Etiquetas", icon: TagIcon },
  { value: "set_status", label: "Alterar Status", icon: Play },
  { value: "assign_agent", label: "Atribuir Atendente", icon: UserCircle },
  { value: "transfer", label: "Transferir", icon: ArrowRight },
];

const statusOptions = [
  { value: "open", label: "Aberto" },
  { value: "pending", label: "Pendente" },
  { value: "resolved", label: "Resolvido" },
];

const robotActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "send_text", "send_image", "send_audio", "send_video", "send_document",
    "simulate_typing", "simulate_recording", "delay",
    "add_tag", "remove_tag", "remove_all_tags", "set_status", "assign_agent", "transfer"
  ]),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  fileName: z.string().optional(),
  delayMs: z.number().optional(),
  tagId: z.string().optional(),
  status: z.enum(["open", "pending", "resolved"]).optional(),
  agentId: z.string().optional(),
});

const robotFormSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  actions: z.array(robotActionSchema),
});

type RobotFormData = z.infer<typeof robotFormSchema>;
type RobotActionData = z.infer<typeof robotActionSchema>;

interface SortableActionItemProps {
  action: RobotActionData;
  index: number;
  onRemove: () => void;
  tags: Tag[];
  users: User[];
}

function SortableActionItem({ action, index, onRemove, tags, users }: SortableActionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: action.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const actionType = actionTypes.find(a => a.value === action.type);
  const ActionIcon = actionType?.icon || Bot;

  const getActionDescription = () => {
    switch (action.type) {
      case "send_text":
        return action.content ? `"${action.content.substring(0, 50)}${action.content.length > 50 ? "..." : ""}"` : "Texto vazio";
      case "send_image":
      case "send_video":
      case "send_audio":
      case "send_document":
        return action.mediaUrl || action.fileName || "Arquivo nao definido";
      case "simulate_typing":
        return `Digitando por ${(action.delayMs || 3000) / 1000}s`;
      case "simulate_recording":
        return `Gravando por ${(action.delayMs || 3000) / 1000}s`;
      case "delay":
        return `Aguardar ${(action.delayMs || 2000) / 1000}s`;
      case "add_tag":
      case "remove_tag":
        const tag = tags.find(t => t.id === action.tagId);
        return tag?.name || "Etiqueta nao selecionada";
      case "remove_all_tags":
        return "Remove todas as etiquetas do contato";
      case "set_status":
        return statusOptions.find(s => s.value === action.status)?.label || "Status nao selecionado";
      case "assign_agent":
        const agent = users.find(u => u.id === action.agentId);
        return agent?.name || "Atendente nao selecionado";
      case "transfer":
        return "Transferir para humano";
      default:
        return "";
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-3 border rounded-md bg-background" data-testid={`action-item-${index}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      <Badge variant="secondary" className="shrink-0">
        {index + 1}
      </Badge>
      <ActionIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{actionType?.label}</span>
        <p className="text-xs text-muted-foreground truncate">{getActionDescription()}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} data-testid={`button-remove-action-${index}`}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

interface RobotCardProps {
  robot: Robot;
  isAdmin: boolean;
  onEdit: (robot: Robot) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

function RobotCard({ robot, isAdmin, onEdit, onDelete, onToggleActive }: RobotCardProps) {
  const actions = (robot.actions as RobotActionData[]) || [];

  return (
    <Card data-testid={`robot-card-${robot.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium">{robot.name}</span>
              <Badge variant={robot.isActive ? "default" : "secondary"} className="text-xs">
                {robot.isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            {robot.description && (
              <p className="text-sm text-muted-foreground mb-2">{robot.description}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{actions.length} acoes</span>
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={robot.isActive}
                onCheckedChange={(checked) => onToggleActive(robot.id, checked)}
                data-testid={`switch-active-${robot.id}`}
              />
              <Button variant="ghost" size="icon" onClick={() => onEdit(robot)} data-testid={`button-edit-robot-${robot.id}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-delete-robot-${robot.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Robo</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir o robo "{robot.name}"? Esta acao nao pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(robot.id)} className="bg-destructive text-destructive-foreground">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function RobotsPage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRobot, setEditingRobot] = useState<Robot | null>(null);
  const [selectedActionType, setSelectedActionType] = useState<string>("");

  const isAdmin = user?.role === "admin" || user?.role === "master";
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const handleFileUpload = async (file: File, index: number) => {
    setUploadingIndex(index);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch("/api/upload", {
        method: "POST",
        body: formData,
        headers: {},
      });

      if (!res.ok) {
        throw new Error("Falha ao enviar arquivo");
      }

      const data = await res.json();
      form.setValue(`actions.${index}.mediaUrl`, data.url);
      form.setValue(`actions.${index}.fileName`, file.name);
      toast({ title: "Arquivo enviado com sucesso" });
    } catch (error: any) {
      toast({ title: error.message || "Erro ao enviar arquivo", variant: "destructive" });
    } finally {
      setUploadingIndex(null);
    }
  };

  const form = useForm<RobotFormData>({
    resolver: zodResolver(robotFormSchema),
    defaultValues: { name: "", description: "", isActive: true, actions: [] },
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "actions",
  });

  const { data: robots = [], isLoading } = useQuery<Robot[]>({
    queryKey: ["/api/robots"],
    queryFn: async () => {
      const res = await authFetch("/api/robots");
      if (!res.ok) throw new Error("Failed to fetch robots");
      return res.json();
    },
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await authFetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const createRobot = useMutation({
    mutationFn: async (data: RobotFormData) => {
      const res = await authFetch("/api/robots", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create robot");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/robots"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Robo criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar robo", variant: "destructive" });
    },
  });

  const updateRobot = useMutation({
    mutationFn: async (data: RobotFormData & { id: string }) => {
      const res = await authFetch(`/api/robots/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          isActive: data.isActive,
          actions: data.actions,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update robot");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/robots"] });
      setIsDialogOpen(false);
      setEditingRobot(null);
      form.reset();
      toast({ title: "Robo atualizado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar robo", variant: "destructive" });
    },
  });

  const deleteRobot = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/robots/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete robot");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/robots"] });
      toast({ title: "Robo excluido com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir robo", variant: "destructive" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await authFetch(`/api/robots/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle robot");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/robots"] });
    },
    onError: () => {
      toast({ title: "Falha ao alterar status", variant: "destructive" });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      move(oldIndex, newIndex);
    }
  };

  const handleOpenDialog = (robot?: Robot) => {
    if (robot) {
      setEditingRobot(robot);
      const actions = (robot.actions as RobotActionData[]) || [];
      form.reset({
        name: robot.name,
        description: robot.description || "",
        isActive: robot.isActive,
        actions: actions.map((a) => ({
          id: a.id || crypto.randomUUID(),
          type: a.type as any,
          content: a.content,
          mediaUrl: a.mediaUrl,
          fileName: a.fileName,
          delayMs: a.delayMs,
          tagId: a.tagId,
          status: a.status as any,
          agentId: a.agentId,
        })),
      });
    } else {
      setEditingRobot(null);
      form.reset({ name: "", description: "", isActive: true, actions: [] });
    }
    setIsDialogOpen(true);
  };

  const handleAddAction = () => {
    if (!selectedActionType) return;
    const newAction: RobotActionData = {
      id: crypto.randomUUID(),
      type: selectedActionType as any,
      delayMs: ["simulate_typing", "simulate_recording", "delay"].includes(selectedActionType) ? 3000 : undefined,
    };
    append(newAction);
    setSelectedActionType("");
  };

  const handleSubmit = (data: RobotFormData) => {
    if (editingRobot) {
      updateRobot.mutate({ ...data, id: editingRobot.id });
    } else {
      createRobot.mutate(data);
    }
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <EmptyState
            icon={Bot}
            title="Acesso Restrito"
            description="Apenas administradores podem gerenciar robos"
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Robos de Auto-Atendimento</h1>
            <p className="text-sm text-muted-foreground">Configure scripts automatizados para atendimento com comportamento humano</p>
          </div>
          <Button onClick={() => handleOpenDialog()} data-testid="button-create-robot">
            <Plus className="h-4 w-4 mr-2" />
            Novo Robo
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : robots.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Nenhum robo configurado"
            description="Crie robos para automatizar atendimentos com comportamento humano"
            action={
              <Button onClick={() => handleOpenDialog()} data-testid="button-create-robot-empty">
                <Plus className="h-4 w-4 mr-2" />
                Criar Robo
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {robots.map((robot) => (
              <RobotCard
                key={robot.id}
                robot={robot}
                isAdmin={isAdmin}
                onEdit={handleOpenDialog}
                onDelete={(id) => deleteRobot.mutate(id)}
                onToggleActive={(id, isActive) => toggleActive.mutate({ id, isActive })}
              />
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>{editingRobot ? "Editar Robo" : "Novo Robo"}</DialogTitle>
              <DialogDescription>
                Configure a sequencia de acoes do robo. Use variaveis como {"{{nome}}"}, {"{{telefone}}"}, {"{{primeiro_nome}}"}.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0 overflow-hidden">
                  {/* Left column - Basic info */}
                  <div className="space-y-4 lg:col-span-1 overflow-y-auto pr-2">
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Configuracoes</h3>
                      
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Ex: Boas-vindas" data-testid="input-robot-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Descricao</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Descricao opcional do robo" rows={3} data-testid="input-robot-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between gap-2 rounded-lg border p-3 bg-background">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm">Ativo</FormLabel>
                              <FormDescription className="text-xs">Robo disponivel para execucao</FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-robot-active" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-3">Variaveis disponiveis</h3>
                      <div className="space-y-1 text-xs">
                        <p><code className="px-1 py-0.5 bg-muted rounded">{"{{nome}}"}</code> - Nome completo</p>
                        <p><code className="px-1 py-0.5 bg-muted rounded">{"{{primeiro_nome}}"}</code> - Primeiro nome</p>
                        <p><code className="px-1 py-0.5 bg-muted rounded">{"{{telefone}}"}</code> - Telefone</p>
                        <p><code className="px-1 py-0.5 bg-muted rounded">{"{{empresa}}"}</code> - Empresa</p>
                        <p><code className="px-1 py-0.5 bg-muted rounded">{"{{atendente}}"}</code> - Atendente</p>
                      </div>
                    </div>
                  </div>

                  {/* Right column - Actions */}
                  <div className="lg:col-span-2 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
                      <FormLabel className="text-base">Acoes ({fields.length})</FormLabel>
                      <div className="flex gap-2 flex-1 max-w-md">
                        <Select value={selectedActionType} onValueChange={setSelectedActionType}>
                          <SelectTrigger className="flex-1" data-testid="select-action-type">
                            <SelectValue placeholder="Selecione uma acao" />
                          </SelectTrigger>
                          <SelectContent>
                            {actionTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div className="flex items-center gap-2">
                                  <type.icon className="h-4 w-4" />
                                  {type.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={handleAddAction} disabled={!selectedActionType} data-testid="button-add-action">
                          <Plus className="h-4 w-4 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto border rounded-lg p-3 bg-muted/20 min-h-[300px]">

                  {fields.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {fields.map((field, index) => (
                            <div key={field.id} className="space-y-2">
                              <SortableActionItem
                                action={field}
                                index={index}
                                onRemove={() => remove(index)}
                                tags={tags}
                                users={users}
                              />
                              
                              {/* Form fields based on action type */}
                              {["send_text"].includes(field.type) && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.content`}
                                  render={({ field: inputField }) => (
                                    <FormItem className="ml-10">
                                      <FormControl>
                                        <Textarea {...inputField} placeholder="Digite a mensagem..." rows={2} data-testid={`input-action-content-${index}`} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              )}

                              {["send_image", "send_audio", "send_video", "send_document"].includes(field.type) && (
                                <div className="ml-10 space-y-2">
                                  <FormField
                                    control={form.control}
                                    name={`actions.${index}.mediaUrl`}
                                    render={({ field: inputField }) => (
                                      <FormItem>
                                        <div className="flex gap-2">
                                          <FormControl>
                                            <Input 
                                              {...inputField} 
                                              placeholder="URL do arquivo ou caminho local" 
                                              data-testid={`input-action-media-${index}`}
                                              className="flex-1"
                                            />
                                          </FormControl>
                                          <input
                                            type="file"
                                            ref={(el) => { fileInputRefs.current[index] = el; }}
                                            className="hidden"
                                            accept={
                                              field.type === "send_image" ? "image/*" :
                                              field.type === "send_audio" ? "audio/*" :
                                              field.type === "send_video" ? "video/*" :
                                              "*"
                                            }
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                handleFileUpload(file, index);
                                              }
                                            }}
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => fileInputRefs.current[index]?.click()}
                                            disabled={uploadingIndex === index}
                                            data-testid={`button-upload-file-${index}`}
                                          >
                                            {uploadingIndex === index ? (
                                              <LoadingSpinner />
                                            ) : (
                                              <Upload className="h-4 w-4" />
                                            )}
                                          </Button>
                                          {inputField.value && (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => {
                                                form.setValue(`actions.${index}.mediaUrl`, "");
                                                form.setValue(`actions.${index}.fileName`, "");
                                              }}
                                              data-testid={`button-clear-file-${index}`}
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </div>
                                        {form.watch(`actions.${index}.fileName`) && (
                                          <p className="text-xs text-muted-foreground">
                                            Arquivo: {form.watch(`actions.${index}.fileName`)}
                                          </p>
                                        )}
                                      </FormItem>
                                    )}
                                  />
                                  {["send_image", "send_video"].includes(field.type) && (
                                    <FormField
                                      control={form.control}
                                      name={`actions.${index}.content`}
                                      render={({ field: inputField }) => (
                                        <FormItem>
                                          <FormControl>
                                            <Input 
                                              {...inputField} 
                                              placeholder="Legenda (opcional)" 
                                              data-testid={`input-action-caption-${index}`}
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  )}
                                </div>
                              )}

                              {["simulate_typing", "simulate_recording", "delay"].includes(field.type) && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.delayMs`}
                                  render={({ field: inputField }) => (
                                    <FormItem className="ml-10">
                                      <FormControl>
                                        <Input
                                          type="number"
                                          step="0.1"
                                          min="0.1"
                                          value={Math.round((inputField.value || 3000) / 100) / 10}
                                          onChange={(e) => inputField.onChange(Math.round(parseFloat(e.target.value || "0") * 1000))}
                                          placeholder="Duracao em segundos"
                                          data-testid={`input-action-delay-${index}`}
                                        />
                                      </FormControl>
                                      <FormDescription>Duracao em segundos</FormDescription>
                                    </FormItem>
                                  )}
                                />
                              )}

                              {["add_tag", "remove_tag"].includes(field.type) && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.tagId`}
                                  render={({ field: inputField }) => (
                                    <FormItem className="ml-10">
                                      <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-action-tag-${index}`}>
                                            <SelectValue placeholder="Selecione uma etiqueta" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {tags.map((tag) => (
                                            <SelectItem key={tag.id} value={tag.id}>
                                              <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                                                {tag.name}
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              )}

                              {field.type === "set_status" && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.status`}
                                  render={({ field: inputField }) => (
                                    <FormItem className="ml-10">
                                      <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-action-status-${index}`}>
                                            <SelectValue placeholder="Selecione o status" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {statusOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              )}

                              {field.type === "assign_agent" && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.agentId`}
                                  render={({ field: inputField }) => (
                                    <FormItem className="ml-10">
                                      <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-action-agent-${index}`}>
                                            <SelectValue placeholder="Selecione o atendente" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {users.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}

                  {fields.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8 border rounded-md border-dashed">
                      Nenhuma acao adicionada. Selecione uma acao acima para comecar.
                    </p>
                  )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 mt-4 border-t shrink-0">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createRobot.isPending || updateRobot.isPending} data-testid="button-save-robot">
                    {(createRobot.isPending || updateRobot.isPending) && <LoadingSpinner className="mr-2" />}
                    {editingRobot ? "Salvar" : "Criar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
