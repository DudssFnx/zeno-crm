import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Bot, GripVertical, Clock, Timer, MessageSquare, Mic, Play, Tag as TagIcon, UserCircle, Image, FileText, Video, ArrowRight, Upload, X, ArrowDown, Circle, Zap, MessageCircle, Reply, Sun, Hash, Layers, Calendar, Search, Sparkles, Hourglass, MessageCircleQuestion, GitBranch } from "lucide-react";
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

// Tipos de gatilho (triggers) para automacao
const triggerTypes = [
  { value: "first_message", label: "1a Msg Contato", description: "Primeira mensagem do contato", icon: MessageCircle, color: "#10B981" },
  { value: "first_message_of_day", label: "1a Msg do Dia", description: "Primeira mensagem do dia", icon: Sun, color: "#F59E0B" },
  { value: "keyword", label: "Palavra-chave", description: "Mensagem com palavras-chave", icon: Hash, color: "#8B5CF6" },
  { value: "response", label: "Resposta", description: "Qualquer resposta do cliente", icon: Reply, color: "#3B82F6" },
  { value: "any_message", label: "Qualquer Msg", description: "Qualquer mensagem recebida", icon: MessageSquare, color: "#6366F1" },
];

const actionTypes = [
  { value: "send_text", label: "Enviar Texto", icon: MessageSquare, color: "#3B82F6", category: "mensagem" },
  { value: "send_image", label: "Enviar Imagem", icon: Image, color: "#8B5CF6", category: "mensagem" },
  { value: "send_audio", label: "Enviar Audio", icon: Mic, color: "#EC4899", category: "mensagem" },
  { value: "send_video", label: "Enviar Video", icon: Video, color: "#F59E0B", category: "mensagem" },
  { value: "send_document", label: "Enviar Documento", icon: FileText, color: "#10B981", category: "mensagem" },
  { value: "smart_typing", label: "Digitacao Inteligente", icon: Sparkles, color: "#1565C0", category: "humano" },
  { value: "human_delay", label: "Pausa Humana", icon: Hourglass, color: "#059669", category: "humano" },
  { value: "wait_response", label: "Aguardar Resposta", icon: MessageCircleQuestion, color: "#7C3AED", category: "humano" },
  { value: "conditional", label: "Condicao", icon: GitBranch, color: "#F59E0B", category: "logica" },
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
  { value: "move_stage", label: "Mover Estagio", icon: Layers, color: "#1565C0", category: "kanban" },
  { value: "extract_data", label: "Extrair Dados", icon: Search, color: "#7C3AED", category: "dados" },
  { value: "schedule_followup", label: "Agendar Followup", icon: Calendar, color: "#059669", category: "tempo" },
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
    "smart_typing", "human_delay", "wait_response", "conditional",
    "simulate_typing", "simulate_recording", "delay", "random_delay",
    "add_tag", "remove_tag", "remove_all_tags", 
    "add_attribute", "remove_attribute", "remove_all_attributes",
    "set_status", "assign_agent", "transfer",
    "move_stage", "extract_data", "schedule_followup"
  ]),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  fileName: z.string().optional(),
  delayMs: z.number().optional(),
  minDelayMs: z.number().optional(),
  maxDelayMs: z.number().optional(),
  tagId: z.string().optional(),
  attributeId: z.string().optional(),
  status: z.enum(["open", "pending", "resolved"]).optional(),
  agentId: z.string().optional(),
  stageId: z.string().optional(),
  followupDelayMinutes: z.number().optional(),
  onlyIfNoResponse: z.boolean().optional(),
  waitTimeoutSeconds: z.number().optional(),
  fallbackAction: z.enum(["continue", "stop", "goto"]).optional(),
  conditionType: z.enum(["keyword", "has_tag", "no_tag", "has_attribute"]).optional(),
  conditionValue: z.string().optional(),
  gotoRobotId: z.string().optional(),
  extractionRule: z.object({
    pattern: z.string(),
    extractName: z.boolean().optional(),
    extractCity: z.boolean().optional(),
    extractState: z.boolean().optional(),
  }).optional(),
});

const robotTriggerSchema = z.object({
  type: z.enum(["manual", "first_message", "first_message_of_day", "any_message", "keyword", "response", "no_response", "scheduled"]),
  keywords: z.array(z.string()).optional(),
});

const robotFormSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  isAutomatic: z.boolean().default(false),
  triggers: z.array(robotTriggerSchema).default([]),
  actions: z.array(robotActionSchema),
});

type RobotTriggerData = z.infer<typeof robotTriggerSchema>;

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
  stages: { id: string; name: string; color: string }[];
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
  stages,
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
      case "smart_typing":
        return "auto";
      case "human_delay":
        return `${(action.minDelayMs || 1000)/1000}-${(action.maxDelayMs || 3000)/1000}s`;
      case "wait_response":
        return `${action.waitTimeoutSeconds || 60}s`;
      case "conditional":
        return action.conditionValue?.substring(0, 15) || "";
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
      case "move_stage":
        const stage = stages.find(s => s.id === action.stageId);
        return stage?.name || "";
      case "extract_data":
        return action.extractionRule?.pattern ? `/${action.extractionRule.pattern.substring(0, 20)}${action.extractionRule.pattern.length > 20 ? "..." : ""}/` : "";
      case "schedule_followup":
        return action.followupDelayMinutes ? `${action.followupDelayMinutes}min` : "";
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

          {action.type === "move_stage" && (
            <FormField
              control={form.control}
              name={`actions.${index}.stageId`}
              render={({ field: inputField }) => (
                <FormItem>
                  <Select value={inputField.value || ""} onValueChange={inputField.onChange}>
                    <FormControl>
                      <SelectTrigger className="text-sm" data-testid={`select-block-stage-${index}`}>
                        <SelectValue placeholder="Selecione estagio" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          )}

          {action.type === "extract_data" && (
            <div className="space-y-2">
              <FormField
                control={form.control}
                name={`actions.${index}.extractionRule.pattern`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Padrao Regex</FormLabel>
                    <FormControl>
                      <Input 
                        {...inputField} 
                        placeholder="sou (\w+) de (\w+)" 
                        className="text-sm font-mono"
                        data-testid={`input-block-extraction-pattern-${index}`} 
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      Use grupos (parênteses) para capturar nome e cidade
                    </FormDescription>
                  </FormItem>
                )}
              />
              <div className="flex gap-4 text-xs">
                <FormField
                  control={form.control}
                  name={`actions.${index}.extractionRule.extractName`}
                  render={({ field: inputField }) => (
                    <FormItem className="flex items-center gap-1.5">
                      <FormControl>
                        <Switch checked={inputField.value || false} onCheckedChange={inputField.onChange} />
                      </FormControl>
                      <FormLabel className="text-xs !mt-0">Extrair Nome</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`actions.${index}.extractionRule.extractCity`}
                  render={({ field: inputField }) => (
                    <FormItem className="flex items-center gap-1.5">
                      <FormControl>
                        <Switch checked={inputField.value || false} onCheckedChange={inputField.onChange} />
                      </FormControl>
                      <FormLabel className="text-xs !mt-0">Extrair Cidade</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          )}

          {action.type === "schedule_followup" && (
            <div className="space-y-2">
              <FormField
                control={form.control}
                name={`actions.${index}.followupDelayMinutes`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Agendar em (minutos)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        value={inputField.value || ""}
                        onChange={(e) => inputField.onChange(parseInt(e.target.value) || 0)}
                        placeholder="30" 
                        className="text-sm"
                        data-testid={`input-block-followup-delay-${index}`} 
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`actions.${index}.content`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Mensagem</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...inputField} 
                        placeholder="Mensagem de follow-up..." 
                        rows={2} 
                        className="text-sm resize-none"
                        data-testid={`input-block-followup-content-${index}`} 
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`actions.${index}.onlyIfNoResponse`}
                render={({ field: inputField }) => (
                  <FormItem className="flex items-center gap-1.5">
                    <FormControl>
                      <Switch checked={inputField.value || false} onCheckedChange={inputField.onChange} />
                    </FormControl>
                    <FormLabel className="text-xs !mt-0">Somente se nao houver resposta</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          )}

          {action.type === "smart_typing" && (
            <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Simula digitacao proporcional ao tamanho da proxima mensagem (50-80ms por caractere + variacao)
            </div>
          )}

          {action.type === "human_delay" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <FormField
                  control={form.control}
                  name={`actions.${index}.minDelayMs`}
                  render={({ field: inputField }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">Min (ms)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          value={inputField.value || 1000}
                          onChange={(e) => inputField.onChange(parseInt(e.target.value) || 1000)}
                          className="text-sm"
                          data-testid={`input-block-min-delay-${index}`} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`actions.${index}.maxDelayMs`}
                  render={({ field: inputField }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">Max (ms)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          value={inputField.value || 3000}
                          onChange={(e) => inputField.onChange(parseInt(e.target.value) || 3000)}
                          className="text-sm"
                          data-testid={`input-block-max-delay-${index}`} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Pausa aleatoria entre min e max para parecer humano</p>
            </div>
          )}

          {action.type === "wait_response" && (
            <div className="space-y-2">
              <FormField
                control={form.control}
                name={`actions.${index}.waitTimeoutSeconds`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Timeout (segundos)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        value={inputField.value || 60}
                        onChange={(e) => inputField.onChange(parseInt(e.target.value) || 60)}
                        className="text-sm"
                        data-testid={`input-block-timeout-${index}`} 
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`actions.${index}.fallbackAction`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Se nao responder</FormLabel>
                    <Select value={inputField.value || "continue"} onValueChange={inputField.onChange}>
                      <FormControl>
                        <SelectTrigger className="text-sm" data-testid={`select-fallback-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="continue">Continuar fluxo</SelectItem>
                        <SelectItem value="stop">Parar robo</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
          )}

          {action.type === "conditional" && (
            <div className="space-y-2">
              <FormField
                control={form.control}
                name={`actions.${index}.conditionType`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Tipo de Condicao</FormLabel>
                    <Select value={inputField.value || "keyword"} onValueChange={inputField.onChange}>
                      <FormControl>
                        <SelectTrigger className="text-sm" data-testid={`select-condition-type-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="keyword">Palavra-chave na mensagem</SelectItem>
                        <SelectItem value="has_tag">Contato tem etiqueta</SelectItem>
                        <SelectItem value="no_tag">Contato NAO tem etiqueta</SelectItem>
                        <SelectItem value="has_attribute">Contato tem atributo</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`actions.${index}.conditionValue`}
                render={({ field: inputField }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Valor</FormLabel>
                    <FormControl>
                      <Input 
                        {...inputField} 
                        placeholder="palavra ou nome da etiqueta/atributo" 
                        className="text-sm"
                        data-testid={`input-condition-value-${index}`} 
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <p className="text-[10px] text-muted-foreground">Se a condicao for verdadeira, continua. Senao, pula para o proximo bloco.</p>
            </div>
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
    defaultValues: { name: "", description: "", isActive: true, isAutomatic: false, triggers: [], actions: [] },
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "actions",
  });

  const { fields: triggerFields, append: appendTrigger, remove: removeTrigger } = useFieldArray({
    control: form.control,
    name: "triggers",
  });

  // State for keyword input per trigger (indexed by trigger index)
  const [keywordInputs, setKeywordInputs] = useState<{ [key: number]: string }>({});

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

  const { data: stages = [] } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ["/api/stages"],
    queryFn: async () => {
      const res = await authFetch("/api/stages");
      if (!res.ok) throw new Error("Failed to fetch stages");
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
      const triggers = (robot.triggers as RobotTriggerData[]) || [];
      form.reset({
        name: robot.name,
        description: robot.description || "",
        isActive: robot.isActive,
        isAutomatic: robot.isAutomatic || false,
        triggers: triggers.map((t) => ({
          type: t.type as any,
          keywords: t.keywords || [],
        })),
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
      form.reset({ name: "", description: "", isActive: true, isAutomatic: false, triggers: [], actions: [] });
    }
    setKeywordInputs({});
    setIsDialogOpen(true);
  };

  const handleAddTrigger = (type: string) => {
    // Check if trigger already exists (except for keyword which can have multiple)
    const existingTriggers = form.getValues("triggers");
    if (type !== "keyword" && existingTriggers.some(t => t.type === type)) {
      toast({ title: "Este gatilho ja foi adicionado", variant: "destructive" });
      return;
    }
    appendTrigger({ type: type as any, keywords: type === "keyword" ? [] : undefined });
  };

  const handleAddKeyword = (triggerIndex: number) => {
    const input = keywordInputs[triggerIndex] || "";
    if (!input.trim()) return;
    const currentKeywords = form.getValues(`triggers.${triggerIndex}.keywords`) || [];
    form.setValue(`triggers.${triggerIndex}.keywords`, [...currentKeywords, input.trim()]);
    setKeywordInputs(prev => ({ ...prev, [triggerIndex]: "" }));
  };

  const handleRemoveKeyword = (triggerIndex: number, keywordIndex: number) => {
    const currentKeywords = form.getValues(`triggers.${triggerIndex}.keywords`) || [];
    form.setValue(`triggers.${triggerIndex}.keywords`, currentKeywords.filter((_, i) => i !== keywordIndex));
  };

  const getKeywordInput = (index: number) => keywordInputs[index] || "";
  const setKeywordInput = (index: number, value: string) => {
    setKeywordInputs(prev => ({ ...prev, [index]: value }));
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
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Gatilhos
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {triggerTypes.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => handleAddTrigger(type.value)}
                              className="flex items-center gap-2 p-2 rounded-md border bg-card text-xs transition-all hover:shadow-md hover:scale-105"
                              style={{ borderColor: type.color + "40" }}
                              data-testid={`add-trigger-${type.value}`}
                            >
                              <type.icon className="h-4 w-4 shrink-0" style={{ color: type.color }} />
                              <span className="text-[10px] leading-tight">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

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
                      {/* Seção de Gatilhos Configurados */}
                      {triggerFields.length > 0 && (
                        <div className="mb-6">
                          <div className="flex items-center gap-2 mb-3">
                            <Zap className="h-4 w-4 text-amber-500" />
                            <h4 className="font-medium text-sm">Gatilhos Configurados</h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {triggerFields.map((trigger, index) => {
                              const triggerType = triggerTypes.find(t => t.value === trigger.type);
                              const TriggerIcon = triggerType?.icon || Zap;
                              return (
                                <div
                                  key={index}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card shadow-sm"
                                  style={{ borderColor: triggerType?.color + "40" }}
                                >
                                  <TriggerIcon className="h-4 w-4" style={{ color: triggerType?.color }} />
                                  <div className="flex-1">
                                    <span className="text-sm font-medium">{triggerType?.label || trigger.type}</span>
                                    {trigger.type === "keyword" && (
                                      <div className="mt-1 flex flex-wrap gap-1 items-center">
                                        {(form.watch(`triggers.${index}.keywords`) || []).map((kw: string, kwIndex: number) => (
                                          <Badge key={kwIndex} variant="secondary" className="text-xs">
                                            {kw}
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveKeyword(index, kwIndex)}
                                              className="ml-1 hover:text-destructive"
                                              data-testid={`button-remove-keyword-${index}-${kwIndex}`}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </Badge>
                                        ))}
                                        <div className="flex items-center gap-1">
                                          <Input
                                            value={getKeywordInput(index)}
                                            onChange={(e) => setKeywordInput(index, e.target.value)}
                                            placeholder="Digite..."
                                            className="h-6 w-20 text-xs"
                                            data-testid={`input-keyword-${index}`}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddKeyword(index);
                                              }
                                            }}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2"
                                            onClick={() => handleAddKeyword(index)}
                                            data-testid={`button-add-keyword-${index}`}
                                          >
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeTrigger(index)}
                                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {fields.length === 0 && triggerFields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Zap className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <h3 className="font-medium mb-1">Configure seu Robo</h3>
                          <p className="text-sm text-muted-foreground max-w-xs">
                            1. Adicione um <span className="text-amber-500 font-medium">Gatilho</span> para definir quando o robo sera ativado
                            <br />
                            2. Adicione <span className="text-blue-500 font-medium">Acoes</span> para definir o que o robo fara
                          </p>
                        </div>
                      ) : fields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <Circle className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <h3 className="font-medium mb-1 text-sm">Adicione Acoes</h3>
                          <p className="text-xs text-muted-foreground max-w-xs">
                            Clique nos blocos de Mensagens, Etiquetas ou outros para definir o comportamento do robo
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
                                    stages={stages}
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
