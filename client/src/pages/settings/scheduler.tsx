import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Calendar, Clock, MessageSquare, Mic, Image, Video, FileText, Upload, X, Send, User, Phone } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { ScheduledMessage, Contact, WhatsappAccount } from "@shared/schema";

const messageTypes = [
  { value: "text", label: "Texto", icon: MessageSquare },
  { value: "audio", label: "Audio", icon: Mic },
  { value: "image", label: "Imagem", icon: Image },
  { value: "video", label: "Video", icon: Video },
  { value: "document", label: "Documento", icon: FileText },
];

const schedulerFormSchema = z.object({
  contactId: z.string().min(1, "Selecione um contato"),
  whatsappAccountId: z.string().min(1, "Selecione uma conta"),
  messageType: z.string().default("text"),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  scheduledFor: z.string().min(1, "Selecione a data/hora"),
});

type SchedulerFormData = z.infer<typeof schedulerFormSchema>;

type ScheduledMessageWithDetails = ScheduledMessage & {
  contact?: Contact;
  whatsappAccount?: WhatsappAccount;
};

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pendente</Badge>;
    case "sent":
      return <Badge className="bg-green-500 text-white">Enviada</Badge>;
    case "failed":
      return <Badge variant="destructive">Falhou</Badge>;
    case "cancelled":
      return <Badge variant="outline">Cancelada</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getMessageTypeIcon(type: string) {
  const typeInfo = messageTypes.find(t => t.value === type);
  const Icon = typeInfo?.icon || MessageSquare;
  return <Icon className="h-4 w-4" />;
}

export default function SchedulerPage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<SchedulerFormData>({
    resolver: zodResolver(schedulerFormSchema),
    defaultValues: {
      messageType: "text",
      content: "",
      mediaUrl: "",
      scheduledFor: "",
    },
  });

  const selectedMessageType = form.watch("messageType");

  const { data: scheduledMessages = [], isLoading } = useQuery<ScheduledMessageWithDetails[]>({
    queryKey: ["/api/scheduled-messages"],
    queryFn: async () => {
      const res = await authFetch("/api/scheduled-messages");
      if (!res.ok) throw new Error("Failed to fetch scheduled messages");
      return res.json();
    },
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await authFetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
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

  const createScheduledMessage = useMutation({
    mutationFn: async (data: SchedulerFormData) => {
      const res = await authFetch("/api/scheduled-messages", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          scheduledFor: new Date(data.scheduledFor).toISOString(),
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to schedule message");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-messages"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Mensagem agendada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao agendar mensagem", variant: "destructive" });
    },
  });

  const cancelScheduledMessage = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduled-messages/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to cancel message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-messages"] });
      toast({ title: "Mensagem cancelada" });
    },
    onError: () => {
      toast({ title: "Falha ao cancelar mensagem", variant: "destructive" });
    },
  });

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch("/api/upload", {
        method: "POST",
        body: formData,
        headers: {},
      });

      if (!res.ok) throw new Error("Falha ao enviar arquivo");

      const data = await res.json();
      form.setValue("mediaUrl", data.url);
      toast({ title: "Arquivo enviado com sucesso" });
    } catch (error: any) {
      toast({ title: error.message || "Erro ao enviar arquivo", variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = (data: SchedulerFormData) => {
    createScheduledMessage.mutate(data);
  };

  const pendingMessages = scheduledMessages.filter(m => m.status === "pending");
  const historyMessages = scheduledMessages.filter(m => m.status !== "pending");

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Agendador de Mensagens</h1>
            <p className="text-sm text-muted-foreground">Agende mensagens de texto ou audio para enviar em uma data/hora especifica</p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-schedule-message">
            <Plus className="h-4 w-4 mr-2" />
            Agendar Mensagem
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : scheduledMessages.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="Nenhuma mensagem agendada"
            description="Agende mensagens para enviar automaticamente aos seus contatos"
            action={
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-schedule-message-empty">
                <Plus className="h-4 w-4 mr-2" />
                Agendar Mensagem
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {pendingMessages.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Pendentes ({pendingMessages.length})
                </h2>
                <div className="space-y-3">
                  {pendingMessages.map((msg) => {
                    const contact = contacts.find(c => c.id === msg.contactId);
                    const account = whatsappAccounts.find(a => a.id === msg.whatsappAccountId);
                    
                    return (
                      <Card key={msg.id} data-testid={`scheduled-message-${msg.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                {getMessageTypeIcon(msg.mediaType || "text")}
                                <span className="font-medium">{contact?.name || "Contato"}</span>
                                <span className="text-sm text-muted-foreground">{contact?.phoneNumber}</span>
                                {getStatusBadge(msg.status)}
                              </div>
                              
                              {msg.content && (
                                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                  {msg.content}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(msg.scheduledFor), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                                </span>
                                {account && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {account.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-cancel-message-${msg.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancelar Mensagem</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja cancelar esta mensagem agendada?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => cancelScheduledMessage.mutate(msg.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Cancelar Mensagem
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
            
            {historyMessages.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Send className="h-5 w-5 text-muted-foreground" />
                  Historico ({historyMessages.length})
                </h2>
                <div className="space-y-2">
                  {historyMessages.slice(0, 10).map((msg) => {
                    const contact = contacts.find(c => c.id === msg.contactId);
                    
                    return (
                      <div 
                        key={msg.id} 
                        className="flex items-center gap-3 p-3 rounded-md border bg-muted/20"
                        data-testid={`history-message-${msg.id}`}
                      >
                        {getMessageTypeIcon(msg.mediaType || "text")}
                        <span className="font-medium text-sm">{contact?.name || "Contato"}</span>
                        <span className="text-xs text-muted-foreground flex-1 truncate">
                          {msg.content?.substring(0, 50)}...
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.scheduledFor), "dd/MM HH:mm")}
                        </span>
                        {getStatusBadge(msg.status)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Agendar Mensagem</DialogTitle>
              <DialogDescription>
                Configure a mensagem e selecione quando ela deve ser enviada
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="whatsappAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conta WhatsApp</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-account">
                            <SelectValue placeholder="Selecione a conta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {whatsappAccounts.filter(a => a.status === "connected").map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({account.phoneNumber})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contato</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-contact">
                            <SelectValue placeholder="Selecione o contato" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {contacts.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                {contact.name} - {contact.phoneNumber}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="messageType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Mensagem</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-message-type">
                            <SelectValue placeholder="Tipo de mensagem" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {messageTypes.map((type) => (
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

                {selectedMessageType === "text" && (
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mensagem</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Digite a mensagem..." 
                            rows={4}
                            data-testid="input-message-content"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {["audio", "image", "video", "document"].includes(selectedMessageType) && (
                  <FormField
                    control={form.control}
                    name="mediaUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Arquivo</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="URL do arquivo" 
                              className="flex-1"
                              data-testid="input-media-url"
                            />
                          </FormControl>
                          <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept={
                              selectedMessageType === "image" ? "image/*" :
                              selectedMessageType === "audio" ? "audio/*" :
                              selectedMessageType === "video" ? "video/*" :
                              "*"
                            }
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file);
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingFile}
                            data-testid="button-upload-file"
                          >
                            {uploadingFile ? <LoadingSpinner /> : <Upload className="h-4 w-4" />}
                          </Button>
                          {field.value && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => form.setValue("mediaUrl", "")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {["image", "video"].includes(selectedMessageType) && (
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legenda (opcional)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Legenda da midia"
                            data-testid="input-media-caption"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="scheduledFor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data e Hora</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local" 
                          {...field}
                          min={new Date().toISOString().slice(0, 16)}
                          data-testid="input-scheduled-datetime"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createScheduledMessage.isPending} data-testid="button-confirm-schedule">
                    {createScheduledMessage.isPending && <LoadingSpinner className="mr-2" />}
                    Agendar
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
