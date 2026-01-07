import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Bot, GripVertical, Clock, Timer, MessageSquare, Mic, Play, Tag as TagIcon, UserCircle, Image, FileText, Video, ArrowRight, Upload, X, ArrowDown, Circle } from "lucide-react";
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
import type { Robot, Tag, User, ContactAttribute } from "@shared/schema";

const actionTypes = [
  { value: "send_text", label: "Enviar Texto", icon: MessageSquare, color: "#3B82F6", category: "mensagem" },
  { value: "send_image", label: "Enviar Imagem", icon: Image, color: "#8B5CF6", category: "mensagem" },
  { value: "send_audio", label: "Enviar Audio", icon: Mic, color: "#EC4899", category: "mensagem" },
  { value: "send_video", label: "Enviar Video", icon: Video, color: "#F59E0B", category: "mensagem" },
  { value: "send_document", label: "Enviar Documento", icon: FileText, color: "#10B981", category: "mensagem" },
  { value: "simulate_typing", label: "Simular Digitando", icon: MessageSquare, color: "#6366F1", category: "simulacao" },
  { value: "simulate_recording", label: "Simular Gravando", icon: Mic, color: "#D946EF", category: "simulacao" },
  { value: "delay", label: "Aguardar", icon: Clock, color: "#F97316", category: "tempo" },
  { value: "random_delay", label: "Tempo Randomico", icon: Timer, color: "#A855F7", category: "tempo" },
  { value: "add_tag", label: "Adicionar Etiqueta", icon: TagIcon, color: "#14B8A6", category: "etiqueta" },
  { value: "remove_tag", label: "Remover Etiqueta", icon: TagIcon, color: "#EF4444", category: "etiqueta" },
  { value: "remove_all_tags", label: "Remover Todas Etiquetas", icon: TagIcon, color: "#DC2626", category: "etiqueta" },
  { value: "add_attribute", label: "Adicionar Atributo", icon: Circle, color: "#8B5CF6", category: "atributo" },
  { value: "remove_attribute", label: "Remover Atributo", icon: Circle, color: "#F59E0B", category: "atributo" },
  { value: "remove_all_attributes", label: "Remover Todos Atributos", icon: Circle, color: "#EF4444", category: "atributo" },
  { value: "set_status", label: "Alterar Status", icon: Play, color: "#0EA5E9", category: "status" },
  { value: "assign_agent", label: "Atribuir Atendente", icon: UserCircle, color: "#84CC16", category: "atendente" },
  { value: "transfer", label: "Transferir", icon: ArrowRight, color: "#F43F5E", category: "atendente" },
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
    "simulate_typing", "simulate_recording", "delay", "random_delay",
    "add_tag", "remove_tag", "remove_all_tags", 
    "add_attribute", "remove_attribute", "remove_all_attributes",
    "set_status", "assign_agent", "transfer"
  ]),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  fileName: z.string().optional(),
  delayMs: z.number().optional(),
  tagId: z.string().optional(),
  attributeId: z.string().optional(),
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

interface FlowBlockProps {
  action: RobotActionData;
  index: number;
  isLast: boolean;
  onRemove: () => void;
  tags: Tag[];
  users: User[];
  contactAttributes: ContactAttribute[];
  form: any;
  onFileUpload: (file: File, index: number) => void;
  uploadingIndex: number | null;
  fileInputRef: (el: HTMLInputElement | null) => void;
  onFileInputClick: () => void;
}

function FlowBlock({ 
  action, 
  index, 
  isLast, 
  onRemove, 
  tags, 
  users, 
  contactAttributes,
  form,
  onFileUpload,
  uploadingIndex,
  fileInputRef,
  onFileInputClick
}: FlowBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: action.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const actionType = actionTypes.find(a => a.value === action.type);
  const ActionIcon = actionType?.icon || Bot;
  const blockColor = actionType?.color || "#6B7280";

  const getActionPreview = () => {
    switch (action.type) {
      case "send_text":
        return action.content ? `"${action.content.substring(0, 40)}${action.content.length > 40 ? "..." : ""}"` : "";
      case "send_image":
      case "send_video":
      case "send_audio":
      case "send_document":
        return action.fileName || "";
      case "simulate_typing":
        return `${(action.delayMs || 3000) / 1000}s`;
      case "simulate_recording":
        return `${(action.delayMs || 3000) / 1000}s`;
      case "delay":
        return `${(action.delayMs || 2000) / 1000}s`;
      case "random_delay":
        return "15-45s";
      case "add_tag":
      case "remove_tag":
        const tag = tags.find(t => t.id === action.tagId);
        return tag?.name || "";
      case "remove_all_tags":
        return "";
      case "add_attribute":
      case "remove_attribute":
        const attr = contactAttributes.find(a => a.id === action.attributeId);
        return attr?.name || "";
      case "remove_all_attributes":
        return "";
      case "set_status":
        return statusOptions.find(s => s.value === action.status)?.label || "";
      case "assign_agent":
        const agent = users.find(u => u.id === action.agentId);
        return agent?.name || "";
      case "transfer":
        return "";
      default:
        return "";
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col items-center" data-testid={`flow-block-${index}`}>
      <div 
        className="relative w-full max-w-md rounded-lg border-2 bg-card shadow-sm transition-all"
        style={{ borderColor: blockColor }}
      >
        <div 
          className="flex items-center gap-2 px-3 py-2 rounded-t-md text-white text-sm font-medium"
          style={{ backgroundColor: blockColor }}
        >
          <div {...attributes} {...listeners} className="cursor-grab">
            <GripVertical className="h-4 w-4" />
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs px-1.5">
            {index + 1}
          </Badge>
          <ActionIcon className="h-4 w-4" />
          <span className="flex-1 truncate">{actionType?.label}</span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20"
            onClick={onRemove} 
            data-testid={`button-remove-block-${index}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="p-3 space-y-2">
          {getActionPreview() && (
            <p className="text-xs text-muted-foreground italic truncate">{getActionPreview()}</p>
          )}

          {["send_text"].includes(action.type) && (
            <FormField
              control={form.control}
              name={`actions.${index}.content`}
              render={({ field: inputField }) => (
                <FormItem>
                  <FormControl>
                    <Textarea 
                      {...inputField} 
                      placeholder="Digite a mensagem..." 
                      rows={3} 
                      className="text-sm resize-none"
                      data-testid={`input-block-content-${index}`} 
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          {["send_image", "send_audio", "send_video", "send_document"].includes(action.type) && (
            <div className="space-y-2">
              <FormField
                control={form.control}
                name={`actions.${index}.mediaUrl`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          {...inputField} 
                          placeholder="URL ou clique para upload" 
                          data-testid={`input-block-media-${index}`}
                          className="flex-1 text-sm"
                        />
                      </FormControl>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept={
                          action.type === "send_image" ? "image/*" :
                          action.type === "send_audio" ? "audio/*" :
                          action.type === "send_video" ? "video/*" :
                          "*"
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onFileUpload(file, index);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onFileInputClick}
                        disabled={uploadingIndex === index}
                        data-testid={`button-upload-block-${index}`}
                      >
                        {uploadingIndex === index ? <LoadingSpinner /> : <Upload className="h-4 w-4" />}
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
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </FormItem>
                )}
              />
              {["send_image", "send_video"].includes(action.type) && (
                <FormField
                  control={form.control}
                  name={`actions.${index}.content`}
                  render={({ field: inputField }) => (
                    <FormItem>
                      <FormControl>
                        <Input 
                          {...inputField} 
                          placeholder="Legenda (opcional)" 
                          className="text-sm"
                          data-testid={`input-block-caption-${index}`}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </div>
          )}

          {["simulate_typing", "simulate_recording", "delay"].includes(action.type) && (
            <FormField
              control={form.control}
              name={`actions.${index}.delayMs`}
              render={({ field: inputField }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="60"
                        value={Math.round((inputField.value || 3000) / 100) / 10}
                        onChange={(e) => inputField.onChange(Math.round(parseFloat(e.target.value || "0") * 1000))}
                        className="w-20 text-sm"
                        data-testid={`input-block-delay-${index}`}
                      />
                    </FormControl>
                    <span className="text-xs text-muted-foreground">segundos</span>
                  </div>
                </FormItem>
              )}
            />
          )}

          {["add_tag", "remove_tag"].includes(action.type) && (
            <FormField
              control={form.control}
              name={`actions.${index}.tagId`}
              render={({ field: inputField }) => (
                <FormItem>
                  <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                    <FormControl>
                      <SelectTrigger className="text-sm" data-testid={`select-block-tag-${index}`}>
                        <SelectValue placeholder="Selecione etiqueta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
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

          {action.type === "set_status" && (
            <FormField
              control={form.control}
              name={`actions.${index}.status`}
              render={({ field: inputField }) => (
                <FormItem>
                  <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                    <FormControl>
                      <SelectTrigger className="text-sm" data-testid={`select-block-status-${index}`}>
                        <SelectValue placeholder="Selecione status" />
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

          {action.type === "assign_agent" && (
            <FormField
              control={form.control}
              name={`actions.${index}.agentId`}
              render={({ field: inputField }) => (
                <FormItem>
                  <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                    <FormControl>
                      <SelectTrigger className="text-sm" data-testid={`select-block-agent-${index}`}>
                        <SelectValue placeholder="Selecione atendente" />
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

          {["add_attribute", "remove_attribute"].includes(action.type) && (
            <FormField
              control={form.control}
              name={`actions.${index}.attributeId`}
              render={({ field: inputField }) => (
                <FormItem>
                  <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                    <FormControl>
                      <SelectTrigger className="text-sm" data-testid={`select-block-attribute-${index}`}>
                        <SelectValue placeholder="Selecione atributo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contactAttributes.map((attr) => (
                        <SelectItem key={attr.id} value={attr.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: attr.color }} />
                            {attr.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          )}
        </div>
      </div>

      {!isLast && (
        <div className="flex flex-col items-center py-1">
          <div className="w-0.5 h-4 bg-border" />
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
          <div className="w-0.5 h-4 bg-border" />
        </div>
      )}
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

  const { data: contactAttributes = [] } = useQuery<ContactAttribute[]>({
    queryKey: ["/api/contact-attributes"],
    queryFn: async () => {
      const res = await authFetch("/api/contact-attributes");
      if (!res.ok) throw new Error("Failed to fetch contact attributes");
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

  const handleAddAction = (type: string) => {
    const newAction: RobotActionData = {
      id: crypto.randomUUID(),
      type: type as any,
      delayMs: ["simulate_typing", "simulate_recording", "delay"].includes(type) ? 3000 : undefined,
    };
    append(newAction);
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
          <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
              <DialogTitle className="text-xl">{editingRobot ? "Editar Robo" : "Novo Robo"}</DialogTitle>
              <DialogDescription>
                Arraste os blocos para reordenar. Use variaveis como {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{periodo_do_dia}}"}, {"{{saudacao}}"}.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 flex min-h-0 overflow-hidden">
                  
                  <div className="w-56 shrink-0 border-r bg-muted/30 p-4 overflow-y-auto">
                    <h3 className="font-semibold text-sm mb-3">Blocos</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Mensagens</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {actionTypes.filter(t => t.category === "mensagem").map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => handleAddAction(type.value)}
                              className="flex flex-col items-center gap-1 p-2 rounded-md border bg-card text-xs transition-all hover:shadow-md hover:scale-105"
                              style={{ borderColor: type.color + "40" }}
                              data-testid={`add-block-${type.value}`}
                            >
                              <type.icon className="h-4 w-4" style={{ color: type.color }} />
                              <span className="text-[10px] leading-tight text-center">{type.label.split(" ")[1] || type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Simulacao</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {actionTypes.filter(t => t.category === "simulacao").map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => handleAddAction(type.value)}
                              className="flex flex-col items-center gap-1 p-2 rounded-md border bg-card text-xs transition-all hover:shadow-md hover:scale-105"
                              style={{ borderColor: type.color + "40" }}
                              data-testid={`add-block-${type.value}`}
                            >
                              <type.icon className="h-4 w-4" style={{ color: type.color }} />
                              <span className="text-[10px] leading-tight text-center">{type.label.split(" ")[1]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Tempo</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {actionTypes.filter(t => t.category === "tempo").map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => handleAddAction(type.value)}
                              className="flex flex-col items-center gap-1 p-2 rounded-md border bg-card text-xs transition-all hover:shadow-md hover:scale-105"
                              style={{ borderColor: type.color + "40" }}
                              data-testid={`add-block-${type.value}`}
                            >
                              <type.icon className="h-4 w-4" style={{ color: type.color }} />
                              <span className="text-[10px] leading-tight text-center">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Etiquetas</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {actionTypes.filter(t => t.category === "etiqueta").map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => handleAddAction(type.value)}
                              className="flex items-center gap-2 p-2 rounded-md border bg-card text-xs transition-all hover:shadow-md hover:scale-105"
                              style={{ borderColor: type.color + "40" }}
                              data-testid={`add-block-${type.value}`}
                            >
                              <type.icon className="h-4 w-4 shrink-0" style={{ color: type.color }} />
                              <span className="text-[10px] leading-tight">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Atributos</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {actionTypes.filter(t => t.category === "atributo").map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => handleAddAction(type.value)}
                              className="flex items-center gap-2 p-2 rounded-md border bg-card text-xs transition-all hover:shadow-md hover:scale-105"
                              style={{ borderColor: type.color + "40" }}
                              data-testid={`add-block-${type.value}`}
                            >
                              <type.icon className="h-4 w-4 shrink-0" style={{ color: type.color }} />
                              <span className="text-[10px] leading-tight">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Atendente</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {actionTypes.filter(t => t.category === "status" || t.category === "atendente").map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => handleAddAction(type.value)}
                              className="flex items-center gap-2 p-2 rounded-md border bg-card text-xs transition-all hover:shadow-md hover:scale-105"
                              style={{ borderColor: type.color + "40" }}
                              data-testid={`add-block-${type.value}`}
                            >
                              <type.icon className="h-4 w-4 shrink-0" style={{ color: type.color }} />
                              <span className="text-[10px] leading-tight">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Variaveis</p>
                      <div className="space-y-1 text-[10px]">
                        <code className="block px-1.5 py-0.5 bg-muted rounded">{"{{nome}}"}</code>
                        <code className="block px-1.5 py-0.5 bg-muted rounded">{"{{primeiro_nome}}"}</code>
                        <code className="block px-1.5 py-0.5 bg-muted rounded">{"{{telefone}}"}</code>
                        <code className="block px-1.5 py-0.5 bg-muted rounded text-green-600 dark:text-green-400">{"{{periodo_do_dia}}"}</code>
                        <code className="block px-1.5 py-0.5 bg-muted rounded text-blue-600 dark:text-blue-400">{"{{saudacao}}"}</code>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-2 leading-relaxed">
                        <span className="text-green-600 dark:text-green-400">periodo_do_dia</span>: variacao aleatoria baseada no horario
                        <br />
                        <span className="text-blue-600 dark:text-blue-400">saudacao</span>: variacao aleatoria de cumprimento
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="shrink-0 px-6 py-3 border-b bg-muted/20">
                      <div className="flex gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs">Nome do Robo</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ex: Boas-vindas" className="h-8" data-testid="input-robot-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs">Descricao (opcional)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Descricao do robo" className="h-8" data-testid="input-robot-description" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="isActive"
                          render={({ field }) => (
                            <FormItem className="flex flex-col items-center gap-1">
                              <FormLabel className="text-xs">Ativo</FormLabel>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-robot-active" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:16px_16px]">
                      {fields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Circle className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <h3 className="font-medium mb-1">Comece seu fluxo</h3>
                          <p className="text-sm text-muted-foreground max-w-xs">
                            Clique nos blocos a esquerda para adicionar acoes ao seu robo
                          </p>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <div className="space-y-0">
                            <div className="flex flex-col items-center mb-2">
                              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-md">
                                <Play className="h-5 w-5" />
                              </div>
                              <div className="w-0.5 h-4 bg-border" />
                            </div>
                            
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                              <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                                {fields.map((field, index) => (
                                  <FlowBlock
                                    key={field.id}
                                    action={field}
                                    index={index}
                                    isLast={index === fields.length - 1}
                                    onRemove={() => remove(index)}
                                    tags={tags}
                                    users={users}
                                    contactAttributes={contactAttributes}
                                    form={form}
                                    onFileUpload={handleFileUpload}
                                    uploadingIndex={uploadingIndex}
                                    fileInputRef={(el) => { fileInputRefs.current[index] = el; }}
                                    onFileInputClick={() => fileInputRefs.current[index]?.click()}
                                  />
                                ))}
                              </SortableContext>
                            </DndContext>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-4 px-6 py-4 border-t shrink-0 bg-background">
                  <div className="text-sm text-muted-foreground">
                    {fields.length} {fields.length === 1 ? "bloco" : "blocos"}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createRobot.isPending || updateRobot.isPending} data-testid="button-save-robot">
                      {(createRobot.isPending || updateRobot.isPending) && <LoadingSpinner className="mr-2" />}
                      {editingRobot ? "Salvar" : "Criar Robo"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
