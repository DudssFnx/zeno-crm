import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Zap, X, Tag as TagIcon, UserCircle, CircleDot, MessageCircle } from "lucide-react";
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
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Macro, Tag, User } from "@shared/schema";

const actionTypes = [
  { value: "ADD_TAG", label: "Adicionar Etiqueta" },
  { value: "REMOVE_TAG", label: "Remover Etiqueta" },
  { value: "SET_STATUS", label: "Alterar Status" },
  { value: "ASSIGN_AGENT", label: "Atribuir Atendente" },
  { value: "SEND_MESSAGE", label: "Enviar Mensagem" },
];

const statusOptions = [
  { value: "open", label: "Aberto" },
  { value: "pending", label: "Pendente" },
  { value: "resolved", label: "Resolvido" },
];

const macroActionSchema = z.object({
  type: z.enum(["ADD_TAG", "REMOVE_TAG", "SET_STATUS", "ASSIGN_AGENT", "SEND_MESSAGE"]),
  tagId: z.string().optional(),
  status: z.enum(["open", "pending", "resolved"]).optional(),
  agentId: z.string().optional(),
  message: z.string().optional(),
});

const macroFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  messageTemplate: z.string().optional(),
  actions: z.array(macroActionSchema),
});

type MacroFormData = z.infer<typeof macroFormSchema>;

export default function MacrosPage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "master";

  const form = useForm<MacroFormData>({
    resolver: zodResolver(macroFormSchema),
    defaultValues: { name: "", description: "", messageTemplate: "", actions: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "actions",
  });

  const { data: macros = [], isLoading } = useQuery<Macro[]>({
    queryKey: ["/api/macros"],
    queryFn: async () => {
      const res = await authFetch("/api/macros");
      if (!res.ok) throw new Error("Failed to fetch macros");
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

  const createMacro = useMutation({
    mutationFn: async (data: MacroFormData) => {
      const res = await authFetch("/api/macros", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create macro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Macro criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar macro", variant: "destructive" });
    },
  });

  const updateMacro = useMutation({
    mutationFn: async (data: MacroFormData & { id: string }) => {
      const res = await authFetch(`/api/macros/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          messageTemplate: data.messageTemplate,
          actions: data.actions,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update macro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });
      setIsDialogOpen(false);
      setEditingMacro(null);
      form.reset();
      toast({ title: "Macro atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar macro", variant: "destructive" });
    },
  });

  const deleteMacro = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/macros/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete macro");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });
      toast({ title: "Macro excluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir macro", variant: "destructive" });
    },
  });

  const handleOpenDialog = (macro?: Macro) => {
    if (macro) {
      setEditingMacro(macro);
      const actions = (macro.actions as Array<{ type: string; tagId?: string; status?: string; agentId?: string; message?: string }>) || [];
      form.reset({
        name: macro.name,
        description: macro.description || "",
        messageTemplate: macro.messageTemplate || "",
        actions: actions.map((a) => ({
          type: a.type as "ADD_TAG" | "REMOVE_TAG" | "SET_STATUS" | "ASSIGN_AGENT" | "SEND_MESSAGE",
          tagId: a.tagId,
          status: a.status as "open" | "pending" | "resolved" | undefined,
          agentId: a.agentId,
          message: a.message,
        })),
      });
    } else {
      setEditingMacro(null);
      form.reset({ name: "", description: "", messageTemplate: "", actions: [] });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: MacroFormData) => {
    if (editingMacro) {
      updateMacro.mutate({ ...data, id: editingMacro.id });
    } else {
      createMacro.mutate(data);
    }
  };

  const getActionLabel = (action: { type: string; tagId?: string; status?: string; agentId?: string; message?: string }) => {
    const tag = tags.find((t) => t.id === action.tagId);
    const agent = users.find((u) => u.id === action.agentId);
    
    switch (action.type) {
      case "ADD_TAG":
        return `Adicionar etiqueta: ${tag?.name || "?"}`;
      case "REMOVE_TAG":
        return `Remover etiqueta: ${tag?.name || "?"}`;
      case "SET_STATUS":
        return `Alterar status: ${statusOptions.find((s) => s.value === action.status)?.label || "?"}`;
      case "ASSIGN_AGENT":
        return action.agentId ? `Atribuir a: ${agent?.name || "?"}` : "Remover atribuição";
      case "SEND_MESSAGE":
        return action.message ? `Enviar: "${action.message.substring(0, 30)}${action.message.length > 30 ? "..." : ""}"` : "Enviar mensagem";
      default:
        return action.type;
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "ADD_TAG":
      case "REMOVE_TAG":
        return TagIcon;
      case "SET_STATUS":
        return CircleDot;
      case "ASSIGN_AGENT":
        return UserCircle;
      case "SEND_MESSAGE":
        return MessageCircle;
      default:
        return Zap;
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Macros</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Atalhos para executar ações automáticas em conversas
              </p>
            </div>
            {isAdmin && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenDialog()} data-testid="button-add-macro">
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Macro
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingMacro ? "Editar Macro" : "Criar Macro"}</DialogTitle>
                    <DialogDescription>
                      {editingMacro
                        ? "Atualize as configurações da macro."
                        : "Configure uma macro para automatizar ações em conversas."}
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
                              <Input
                                {...field}
                                placeholder="Ex: Resolver e agradecer"
                                data-testid="input-macro-name"
                              />
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
                            <FormLabel>Descrição (opcional)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Descreva o que esta macro faz"
                                data-testid="input-macro-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="messageTemplate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mensagem Template (opcional)</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="Digite a mensagem que será enviada..."
                                className="min-h-24"
                                data-testid="input-macro-message"
                              />
                            </FormControl>
                            <FormDescription>
                              Variáveis disponíveis: {"{{nome}}"}, {"{{telefone}}"}, {"{{primeiro_nome}}"}, {"{{empresa}}"}, {"{{tags}}"}, {"{{atendente}}"}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <FormLabel>Ações</FormLabel>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ type: "ADD_TAG" })}
                            data-testid="button-add-action"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Adicionar Ação
                          </Button>
                        </div>

                        {fields.length === 0 && (
                          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                            Nenhuma ação adicionada
                          </p>
                        )}

                        {fields.map((field, index) => {
                          const actionType = form.watch(`actions.${index}.type`);
                          return (
                            <div
                              key={field.id}
                              className="flex items-start gap-2 p-3 border rounded-lg bg-muted/30"
                            >
                              <div className="flex-1 space-y-3">
                                <FormField
                                  control={form.control}
                                  name={`actions.${index}.type`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <Select
                                        value={field.value}
                                        onValueChange={field.onChange}
                                      >
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-action-type-${index}`}>
                                            <SelectValue placeholder="Selecione a ação" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {actionTypes.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                              {type.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />

                                {(actionType === "ADD_TAG" || actionType === "REMOVE_TAG") && (
                                  <FormField
                                    control={form.control}
                                    name={`actions.${index}.tagId`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <Select
                                          value={field.value || ""}
                                          onValueChange={field.onChange}
                                        >
                                          <FormControl>
                                            <SelectTrigger data-testid={`select-action-tag-${index}`}>
                                              <SelectValue placeholder="Selecione a etiqueta" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            {tags.map((tag) => (
                                              <SelectItem key={tag.id} value={tag.id}>
                                                <div className="flex items-center gap-2">
                                                  <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: tag.color }}
                                                  />
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

                                {actionType === "SET_STATUS" && (
                                  <FormField
                                    control={form.control}
                                    name={`actions.${index}.status`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <Select
                                          value={field.value || ""}
                                          onValueChange={field.onChange}
                                        >
                                          <FormControl>
                                            <SelectTrigger data-testid={`select-action-status-${index}`}>
                                              <SelectValue placeholder="Selecione o status" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            {statusOptions.map((status) => (
                                              <SelectItem key={status.value} value={status.value}>
                                                {status.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                  />
                                )}

                                {actionType === "ASSIGN_AGENT" && (
                                  <FormField
                                    control={form.control}
                                    name={`actions.${index}.agentId`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <Select
                                          value={field.value || "none"}
                                          onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
                                        >
                                          <FormControl>
                                            <SelectTrigger data-testid={`select-action-agent-${index}`}>
                                              <SelectValue placeholder="Selecione o atendente" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="none">Remover atribuição</SelectItem>
                                            {users.map((usr) => (
                                              <SelectItem key={usr.id} value={usr.id}>
                                                {usr.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                  />
                                )}

                                {actionType === "SEND_MESSAGE" && (
                                  <FormField
                                    control={form.control}
                                    name={`actions.${index}.message`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormControl>
                                          <Textarea
                                            {...field}
                                            placeholder="Digite a mensagem a ser enviada..."
                                            className="min-h-20"
                                            data-testid={`input-action-message-${index}`}
                                          />
                                        </FormControl>
                                        <FormDescription className="text-xs">
                                          Variáveis: {"{{nome}}"}, {"{{telefone}}"}, {"{{primeiro_nome}}"}, {"{{empresa}}"}, {"{{tags}}"}, {"{{atendente}}"}
                                        </FormDescription>
                                      </FormItem>
                                    )}
                                  />
                                )}
                              </div>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                data-testid={`button-remove-action-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          type="submit"
                          disabled={createMacro.isPending || updateMacro.isPending}
                          data-testid="button-save-macro"
                        >
                          {(createMacro.isPending || updateMacro.isPending) ? (
                            <LoadingSpinner size="sm" className="text-primary-foreground" />
                          ) : editingMacro ? (
                            "Salvar Alterações"
                          ) : (
                            "Criar Macro"
                          )}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {isLoading ? (
            <LoadingCard />
          ) : macros.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Zap}
                  title="Nenhuma macro configurada"
                  description="Macros permitem executar ações automáticas como adicionar etiquetas, alterar status e enviar mensagens"
                  action={
                    isAdmin ? (
                      <Button onClick={() => handleOpenDialog()}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Macro
                      </Button>
                    ) : undefined
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {macros.map((macro) => {
                const actions = (macro.actions as Array<{ type: string; tagId?: string; status?: string; agentId?: string; message?: string }>) || [];
                return (
                  <Card key={macro.id} data-testid={`macro-card-${macro.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{macro.name}</span>
                          </div>
                          {macro.description && (
                            <p className="text-sm text-muted-foreground mb-2">{macro.description}</p>
                          )}
                          {macro.messageTemplate && (
                            <p className="text-sm text-muted-foreground mb-2 italic border-l-2 border-muted pl-2">
                              {macro.messageTemplate.length > 100
                                ? `${macro.messageTemplate.substring(0, 100)}...`
                                : macro.messageTemplate}
                            </p>
                          )}
                          {actions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {actions.map((action, idx) => {
                                const ActionIcon = getActionIcon(action.type);
                                return (
                                  <Badge key={idx} variant="outline" className="text-xs gap-1">
                                    <ActionIcon className="h-3 w-3" />
                                    {getActionLabel(action)}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(macro)}
                              data-testid={`button-edit-macro-${macro.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-delete-macro-${macro.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Macro</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir a macro "{macro.name}"? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMacro.mutate(macro.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
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
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
