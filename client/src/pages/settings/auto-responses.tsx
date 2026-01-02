import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Bot, Power, GripVertical, Clock, Calendar, MessageCircle, Image, Video, Mic, FileText, Tag as TagIcon, UserCircle, CircleDot, Upload, Square, Loader2 } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { AutoResponse, Tag, WhatsappAccount } from "@shared/schema";

const triggerTypes = [
  { value: "any_message", label: "Qualquer mensagem" },
  { value: "keyword", label: "Palavra-chave" },
  { value: "first_message_day", label: "Primeira mensagem do dia" },
  { value: "first_message_ever", label: "Primeira mensagem (novo contato)" },
];

const actionTypes = [
  { value: "send_text", label: "Enviar Texto", icon: MessageCircle },
  { value: "send_image", label: "Enviar Imagem", icon: Image },
  { value: "send_video", label: "Enviar Vídeo", icon: Video },
  { value: "send_audio", label: "Enviar Áudio", icon: Mic },
  { value: "send_document", label: "Enviar Documento", icon: FileText },
  { value: "add_tag", label: "Adicionar Etiqueta", icon: TagIcon },
  { value: "remove_tag", label: "Remover Etiqueta", icon: TagIcon },
  { value: "set_status", label: "Alterar Status", icon: CircleDot },
  { value: "assign_agent", label: "Atribuir Atendente", icon: UserCircle },
];

const statusOptions = [
  { value: "open", label: "Aberto" },
  { value: "pending", label: "Pendente" },
  { value: "resolved", label: "Resolvido" },
];

const weekDays = [
  { value: "0", label: "Dom" },
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sáb" },
];

const autoResponseActionSchema = z.object({
  type: z.enum(["send_text", "send_image", "send_video", "send_audio", "send_document", "add_tag", "remove_tag", "set_status", "assign_agent"]),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  tagId: z.string().optional(),
  status: z.enum(["open", "pending", "resolved"]).optional(),
  agentId: z.string().optional(),
  delayMs: z.number().optional(),
});

const autoResponseFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  triggerType: z.enum(["any_message", "keyword", "first_message_day", "first_message_ever"]),
  keywords: z.array(z.string()).optional(),
  whatsappAccountId: z.string().optional().nullable(),
  allowGroups: z.boolean().optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduleDays: z.array(z.string()).optional(),
  scheduleStartTime: z.string().optional().nullable(),
  scheduleEndTime: z.string().optional().nullable(),
  skipIfConversationOpen: z.boolean().optional(),
  skipIfConversationResolved: z.boolean().optional(),
  includeSignature: z.boolean().optional(),
  actions: z.array(autoResponseActionSchema),
});

type AutoResponseFormData = z.infer<typeof autoResponseFormSchema>;

export default function AutoResponsesPage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAutoResponse, setEditingAutoResponse] = useState<AutoResponse | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const isAdmin = user?.role === "admin" || user?.role === "master";

  // Handle file upload for media actions
  const handleFileUpload = async (file: File, index: number) => {
    setUploadingIndex(index);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Upload falhou");

      const data = await res.json();
      form.setValue(`actions.${index}.mediaUrl`, data.url);
      toast({ title: "Arquivo enviado com sucesso" });
    } catch (error) {
      toast({ title: "Erro ao enviar arquivo", variant: "destructive" });
    } finally {
      setUploadingIndex(null);
    }
  };

  // Start audio recording
  const startRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const extension = mediaRecorder.mimeType.includes("webm") ? "webm" : "m4a";
        const file = new File([audioBlob], `audio_${Date.now()}.${extension}`, { type: mediaRecorder.mimeType });
        
        await handleFileUpload(file, index);
      };
      
      mediaRecorder.start();
      setRecordingIndex(index);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      toast({ title: "Erro ao acessar microfone", variant: "destructive" });
    }
  };

  // Stop audio recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setRecordingIndex(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const form = useForm<AutoResponseFormData>({
    resolver: zodResolver(autoResponseFormSchema),
    defaultValues: {
      name: "",
      triggerType: "any_message",
      keywords: [],
      whatsappAccountId: null,
      allowGroups: false,
      scheduleEnabled: false,
      scheduleDays: [],
      scheduleStartTime: null,
      scheduleEndTime: null,
      skipIfConversationOpen: false,
      skipIfConversationResolved: false,
      includeSignature: false,
      actions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "actions",
  });

  const { data: autoResponses = [], isLoading } = useQuery<AutoResponse[]>({
    queryKey: ["/api/auto-responses"],
    queryFn: async () => {
      const res = await authFetch("/api/auto-responses");
      if (!res.ok) throw new Error("Failed to fetch auto responses");
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

  const { data: whatsappAccounts = [] } = useQuery<WhatsappAccount[]>({
    queryKey: ["/api/whatsapp-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/whatsapp-accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
  });

  const createAutoResponse = useMutation({
    mutationFn: async (data: AutoResponseFormData) => {
      const res = await authFetch("/api/auto-responses", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create auto response");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-responses"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Auto atendimento criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar auto atendimento", variant: "destructive" });
    },
  });

  const updateAutoResponse = useMutation({
    mutationFn: async (data: AutoResponseFormData & { id: string }) => {
      const res = await authFetch(`/api/auto-responses/${data.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update auto response");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-responses"] });
      setIsDialogOpen(false);
      setEditingAutoResponse(null);
      form.reset();
      toast({ title: "Auto atendimento atualizado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar auto atendimento", variant: "destructive" });
    },
  });

  const deleteAutoResponse = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/auto-responses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete auto response");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-responses"] });
      toast({ title: "Auto atendimento excluído com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir auto atendimento", variant: "destructive" });
    },
  });

  const toggleAutoResponse = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/auto-responses/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to toggle auto response");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-responses"] });
    },
  });

  const handleSubmit = (data: AutoResponseFormData) => {
    if (editingAutoResponse) {
      updateAutoResponse.mutate({ ...data, id: editingAutoResponse.id });
    } else {
      createAutoResponse.mutate(data);
    }
  };

  const openEditDialog = (autoResponse: AutoResponse) => {
    setEditingAutoResponse(autoResponse);
    form.reset({
      name: autoResponse.name,
      triggerType: autoResponse.triggerType as any,
      keywords: autoResponse.keywords || [],
      whatsappAccountId: autoResponse.whatsappAccountId,
      allowGroups: autoResponse.allowGroups || false,
      scheduleEnabled: autoResponse.scheduleEnabled || false,
      scheduleDays: autoResponse.scheduleDays || [],
      scheduleStartTime: autoResponse.scheduleStartTime,
      scheduleEndTime: autoResponse.scheduleEndTime,
      skipIfConversationOpen: autoResponse.skipIfConversationOpen || false,
      skipIfConversationResolved: autoResponse.skipIfConversationResolved || false,
      includeSignature: autoResponse.includeSignature || false,
      actions: autoResponse.actions as any || [],
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingAutoResponse(null);
    form.reset({
      name: "",
      triggerType: "any_message",
      keywords: [],
      whatsappAccountId: null,
      allowGroups: false,
      scheduleEnabled: false,
      scheduleDays: [],
      scheduleStartTime: null,
      scheduleEndTime: null,
      skipIfConversationOpen: false,
      skipIfConversationResolved: false,
      includeSignature: false,
      actions: [],
    });
    setIsDialogOpen(true);
  };

  const addKeyword = () => {
    if (keywordInput.trim()) {
      const current = form.getValues("keywords") || [];
      form.setValue("keywords", [...current, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (index: number) => {
    const current = form.getValues("keywords") || [];
    form.setValue("keywords", current.filter((_, i) => i !== index));
  };

  const getTriggerTypeLabel = (type: string) => {
    return triggerTypes.find(t => t.value === type)?.label || type;
  };

  const getActionTypeLabel = (type: string) => {
    return actionTypes.find(a => a.value === type)?.label || type;
  };

  const watchedTriggerType = form.watch("triggerType");
  const watchedScheduleEnabled = form.watch("scheduleEnabled");

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Auto Atendimento</h1>
            <p className="text-muted-foreground">Configure respostas automáticas para mensagens recebidas</p>
          </div>
          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog} data-testid="button-create-auto-response">
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Auto Atendimento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingAutoResponse ? "Editar Auto Atendimento" : "Novo Auto Atendimento"}</DialogTitle>
                  <DialogDescription>
                    Configure as regras de acionamento e ações automáticas
                  </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Ex: Boas-vindas" data-testid="input-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="triggerType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Acionamento</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-trigger-type">
                                <SelectValue placeholder="Selecione o tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {triggerTypes.map(type => (
                                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {watchedTriggerType === "keyword" && (
                      <div className="space-y-2">
                        <FormLabel>Palavras-chave</FormLabel>
                        <div className="flex gap-2">
                          <Input
                            value={keywordInput}
                            onChange={(e) => setKeywordInput(e.target.value)}
                            placeholder="Digite uma palavra-chave"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addKeyword();
                              }
                            }}
                            data-testid="input-keyword"
                          />
                          <Button type="button" onClick={addKeyword} variant="outline" data-testid="button-add-keyword">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(form.watch("keywords") || []).map((kw, idx) => (
                            <Badge key={idx} variant="secondary" className="gap-1">
                              {kw}
                              <button type="button" onClick={() => removeKeyword(idx)} className="ml-1 hover:text-destructive">
                                <span className="sr-only">Remover</span>
                                &times;
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="whatsappAccountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conta WhatsApp (opcional)</FormLabel>
                          <Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-whatsapp-account">
                                <SelectValue placeholder="Todas as contas" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="all">Todas as contas</SelectItem>
                              {whatsappAccounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>Aplica apenas a esta conta específica</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4 border rounded-md p-4">
                      <h4 className="font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Agendamento
                      </h4>
                      
                      <FormField
                        control={form.control}
                        name="scheduleEnabled"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-schedule" />
                            </FormControl>
                            <FormLabel className="!mt-0">Ativar agendamento</FormLabel>
                          </FormItem>
                        )}
                      />

                      {watchedScheduleEnabled && (
                        <>
                          <div className="space-y-2">
                            <FormLabel>Dias da semana</FormLabel>
                            <div className="flex flex-wrap gap-2">
                              {weekDays.map(day => {
                                const currentDays = form.watch("scheduleDays") || [];
                                const isSelected = currentDays.includes(day.value);
                                return (
                                  <Button
                                    key={day.value}
                                    type="button"
                                    size="sm"
                                    variant={isSelected ? "default" : "outline"}
                                    onClick={() => {
                                      const newDays = isSelected
                                        ? currentDays.filter(d => d !== day.value)
                                        : [...currentDays, day.value];
                                      form.setValue("scheduleDays", newDays);
                                    }}
                                    data-testid={`button-day-${day.value}`}
                                  >
                                    {day.label}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="scheduleStartTime"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Hora inicial</FormLabel>
                                  <FormControl>
                                    <Input type="time" {...field} value={field.value || ""} data-testid="input-start-time" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="scheduleEndTime"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Hora final</FormLabel>
                                  <FormControl>
                                    <Input type="time" {...field} value={field.value || ""} data-testid="input-end-time" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="space-y-4 border rounded-md p-4">
                      <h4 className="font-medium">Opções</h4>
                      
                      <FormField
                        control={form.control}
                        name="allowGroups"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-allow-groups" />
                            </FormControl>
                            <FormLabel className="!mt-0">Responder em grupos</FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="skipIfConversationOpen"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-skip-open" />
                            </FormControl>
                            <FormLabel className="!mt-0">Não acionar se conversa estiver aberta</FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="skipIfConversationResolved"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-skip-resolved" />
                            </FormControl>
                            <FormLabel className="!mt-0">Não acionar se conversa estiver resolvida</FormLabel>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="includeSignature"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-signature" />
                            </FormControl>
                            <FormLabel className="!mt-0">Incluir assinatura do atendente</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Ações</h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => append({ type: "send_text", content: "" })}
                          data-testid="button-add-action"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Adicionar Ação
                        </Button>
                      </div>

                      {fields.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhuma ação configurada. Adicione pelo menos uma ação.
                        </p>
                      )}

                      {fields.map((field, index) => {
                        const actionType = form.watch(`actions.${index}.type`);
                        return (
                          <Card key={field.id}>
                            <CardContent className="pt-4 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.type`}
                                  render={({ field }) => (
                                    <FormItem className="flex-1">
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-action-type-${index}`}>
                                            <SelectValue placeholder="Tipo de ação" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {actionTypes.map(type => (
                                            <SelectItem key={type.value} value={type.value}>
                                              <div className="flex items-center gap-2">
                                                <type.icon className="w-4 h-4" />
                                                {type.label}
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => remove(index)}
                                  data-testid={`button-remove-action-${index}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>

                              {actionType === "send_text" && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.content`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Textarea
                                          {...field}
                                          placeholder="Digite a mensagem..."
                                          className="min-h-[80px]"
                                          data-testid={`input-action-content-${index}`}
                                        />
                                      </FormControl>
                                      <FormDescription>
                                        Use: {"{{nome}}"}, {"{{telefone}}"}, {"{{primeiro_nome}}"}
                                      </FormDescription>
                                    </FormItem>
                                  )}
                                />
                              )}

                              {["send_image", "send_video", "send_document"].includes(actionType) && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.mediaUrl`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Arquivo</FormLabel>
                                      <div className="space-y-2">
                                        <input
                                          type="file"
                                          ref={(el) => (fileInputRefs.current[index] = el)}
                                          className="hidden"
                                          accept={
                                            actionType === "send_image" ? "image/*" :
                                            actionType === "send_video" ? "video/*" :
                                            "*/*"
                                          }
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleFileUpload(file, index);
                                          }}
                                          data-testid={`input-action-file-${index}`}
                                        />
                                        <div className="flex items-center gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => fileInputRefs.current[index]?.click()}
                                            disabled={uploadingIndex === index}
                                            data-testid={`button-upload-${index}`}
                                          >
                                            {uploadingIndex === index ? (
                                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                              <Upload className="w-4 h-4 mr-2" />
                                            )}
                                            Escolher arquivo
                                          </Button>
                                          {field.value && (
                                            <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                                              {field.value.split("/").pop()}
                                            </span>
                                          )}
                                        </div>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            placeholder="Ou cole uma URL..."
                                            className="text-sm"
                                            data-testid={`input-action-media-${index}`}
                                          />
                                        </FormControl>
                                      </div>
                                    </FormItem>
                                  )}
                                />
                              )}

                              {actionType === "send_audio" && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.mediaUrl`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Áudio</FormLabel>
                                      <div className="space-y-2">
                                        {recordingIndex === index ? (
                                          <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 rounded-md">
                                              <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                                              <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
                                            </div>
                                            <Button
                                              type="button"
                                              variant="destructive"
                                              size="sm"
                                              onClick={stopRecording}
                                              data-testid={`button-stop-recording-${index}`}
                                            >
                                              <Square className="w-4 h-4 mr-2" />
                                              Parar
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              onClick={() => startRecording(index)}
                                              disabled={uploadingIndex === index || recordingIndex !== null}
                                              data-testid={`button-record-${index}`}
                                            >
                                              {uploadingIndex === index ? (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                              ) : (
                                                <Mic className="w-4 h-4 mr-2" />
                                              )}
                                              Gravar áudio
                                            </Button>
                                            {field.value && (
                                              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                                                {field.value.split("/").pop()}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        <FormControl>
                                          <Input
                                            {...field}
                                            placeholder="Ou cole uma URL..."
                                            className="text-sm"
                                            data-testid={`input-action-media-${index}`}
                                          />
                                        </FormControl>
                                      </div>
                                    </FormItem>
                                  )}
                                />
                              )}

                              {["add_tag", "remove_tag"].includes(actionType) && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.tagId`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-action-tag-${index}`}>
                                            <SelectValue placeholder="Selecione a etiqueta" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {tags.map(tag => (
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

                              {actionType === "set_status" && (
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.status`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-action-status-${index}`}>
                                            <SelectValue placeholder="Selecione o status" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {statusOptions.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              )}

                              <FormField
                                control={form.control}
                                name={`actions.${index}.delayMs`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Delay (ms)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        placeholder="0"
                                        data-testid={`input-action-delay-${index}`}
                                      />
                                    </FormControl>
                                    <FormDescription>Tempo de espera antes de executar esta ação</FormDescription>
                                  </FormItem>
                                )}
                              />
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={createAutoResponse.isPending || updateAutoResponse.isPending}
                        data-testid="button-submit"
                      >
                        {(createAutoResponse.isPending || updateAutoResponse.isPending) && <LoadingSpinner className="mr-2" />}
                        {editingAutoResponse ? "Salvar" : "Criar"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : autoResponses.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Nenhum auto atendimento"
            description="Configure respostas automáticas para acelerar o atendimento"
            action={
              isAdmin ? (
                <Button onClick={openCreateDialog} data-testid="button-create-first">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Auto Atendimento
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {autoResponses.map((ar) => (
              <Card key={ar.id} data-testid={`card-auto-response-${ar.id}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex-shrink-0">
                        <Bot className={`w-5 h-5 ${ar.isActive ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate" data-testid={`text-auto-response-name-${ar.id}`}>
                            {ar.name}
                          </span>
                          <Badge variant={ar.isActive ? "default" : "secondary"} className="text-xs">
                            {ar.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                          <span>{getTriggerTypeLabel(ar.triggerType)}</span>
                          {ar.triggerType === "keyword" && ar.keywords && ar.keywords.length > 0 && (
                            <span className="text-xs">({ar.keywords.slice(0, 3).join(", ")}{ar.keywords.length > 3 ? "..." : ""})</span>
                          )}
                          <span className="text-xs">|</span>
                          <span className="text-xs">{(ar.actions as any[])?.length || 0} ações</span>
                          {ar.scheduleEnabled && (
                            <>
                              <span className="text-xs">|</span>
                              <Clock className="w-3 h-3" />
                              <span className="text-xs">Agendado</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleAutoResponse.mutate(ar.id)}
                            data-testid={`button-toggle-${ar.id}`}
                          >
                            <Power className={`w-4 h-4 ${ar.isActive ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(ar)}
                            data-testid={`button-edit-${ar.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-delete-${ar.id}`}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir auto atendimento?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. O auto atendimento "{ar.name}" será removido permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteAutoResponse.mutate(ar.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
