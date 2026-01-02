import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Zap, MessageSquareText, Star, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { CannedResponse, ContactAttribute } from "@shared/schema";

const MAX_ATTRIBUTES = 3;

const cannedResponseFormSchema = z.object({
  shortcut: z.string().min(1, "O atalho é obrigatório").max(50, "Máximo 50 caracteres"),
  content: z.string().min(1, "O conteúdo é obrigatório"),
});

type CannedResponseFormData = z.infer<typeof cannedResponseFormSchema>;

export default function CannedResponsesPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<CannedResponse | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);

  const form = useForm<CannedResponseFormData>({
    resolver: zodResolver(cannedResponseFormSchema),
    defaultValues: { shortcut: "", content: "" },
  });

  const { data: contactAttributes = [] } = useQuery<ContactAttribute[]>({
    queryKey: ["/api/contact-attributes"],
    queryFn: async () => {
      const res = await authFetch("/api/contact-attributes");
      if (!res.ok) throw new Error("Failed to fetch contact attributes");
      return res.json();
    },
  });

  const { data: cannedResponses = [], isLoading } = useQuery<CannedResponse[]>({
    queryKey: ["/api/canned-responses"],
    queryFn: async () => {
      const res = await authFetch("/api/canned-responses");
      if (!res.ok) throw new Error("Failed to fetch canned responses");
      return res.json();
    },
  });

  const createResponse = useMutation({
    mutationFn: async (data: CannedResponseFormData) => {
      const res = await authFetch("/api/canned-responses", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          attributes: selectedAttributes.length > 0 ? selectedAttributes : null,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create canned response");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/canned-responses"] });
      setIsDialogOpen(false);
      form.reset();
      setSelectedAttributes([]);
      toast({ title: "Resposta rápida criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar resposta rápida", variant: "destructive" });
    },
  });

  const updateResponse = useMutation({
    mutationFn: async (data: CannedResponseFormData & { id: string }) => {
      const res = await authFetch(`/api/canned-responses/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          shortcut: data.shortcut,
          content: data.content,
          attributes: selectedAttributes.length > 0 ? selectedAttributes : null,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update canned response");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/canned-responses"] });
      setIsDialogOpen(false);
      setEditingResponse(null);
      form.reset();
      setSelectedAttributes([]);
      toast({ title: "Resposta rápida atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar resposta rápida", variant: "destructive" });
    },
  });

  const deleteResponse = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/canned-responses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete canned response");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/canned-responses"] });
      toast({ title: "Resposta rápida excluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir resposta rápida", variant: "destructive" });
    },
  });

  const handleOpenDialog = (response?: CannedResponse) => {
    if (response) {
      setEditingResponse(response);
      form.reset({
        shortcut: response.shortcut,
        content: response.content,
      });
      setSelectedAttributes(response.attributes || []);
    } else {
      setEditingResponse(null);
      form.reset({ shortcut: "", content: "" });
      setSelectedAttributes([]);
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: CannedResponseFormData) => {
    if (editingResponse) {
      updateResponse.mutate({ ...data, id: editingResponse.id });
    } else {
      createResponse.mutate(data);
    }
  };

  const addAttribute = (attrName: string) => {
    if (attrName === "NONE") return;
    if (selectedAttributes.length >= MAX_ATTRIBUTES) {
      toast({ 
        title: `Máximo de ${MAX_ATTRIBUTES} atributos`, 
        description: "Remova um atributo para adicionar outro.",
        variant: "destructive" 
      });
      return;
    }
    if (!selectedAttributes.includes(attrName)) {
      setSelectedAttributes([...selectedAttributes, attrName]);
    }
  };

  const removeAttribute = (attrName: string) => {
    setSelectedAttributes(selectedAttributes.filter(a => a !== attrName));
  };

  const getAttributeColor = (attrName: string) => {
    return contactAttributes.find(a => a.name === attrName)?.color || "#6B7280";
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Respostas Rápidas</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure atalhos para respostas frequentes. Use "/" no chat para acessar.
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-canned-response">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Resposta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingResponse ? "Editar Resposta Rápida" : "Criar Resposta Rápida"}</DialogTitle>
                  <DialogDescription>
                    {editingResponse
                      ? "Atualize a configuração da resposta rápida."
                      : "Configure um atalho para enviar mensagens rapidamente."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="shortcut"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Atalho</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder="saudacao"
                                className="pl-10"
                                data-testid="input-canned-response-shortcut"
                              />
                            </div>
                          </FormControl>
                          <FormDescription>
                            Digite "/" seguido do atalho no chat para usar
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conteúdo</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Olá! Como posso ajudá-lo hoje?"
                              rows={4}
                              data-testid="input-canned-response-content"
                            />
                          </FormControl>
                          <FormDescription>
                            Texto que será inserido quando o atalho for usado
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="space-y-2">
                      <FormLabel>Atributos (máximo {MAX_ATTRIBUTES})</FormLabel>
                      
                      {selectedAttributes.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {selectedAttributes.map((attr) => (
                            <Badge 
                              key={attr}
                              variant="outline"
                              className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400 pr-1"
                            >
                              <span 
                                className="w-2 h-2 rounded-full mr-1" 
                                style={{ backgroundColor: getAttributeColor(attr) }}
                              />
                              {attr}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 ml-1 p-0"
                                onClick={() => removeAttribute(attr)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      <Select
                        value=""
                        onValueChange={addAttribute}
                        disabled={selectedAttributes.length >= MAX_ATTRIBUTES}
                      >
                        <SelectTrigger data-testid="select-canned-response-attribute">
                          <SelectValue placeholder={
                            selectedAttributes.length >= MAX_ATTRIBUTES 
                              ? "Máximo de atributos atingido"
                              : "Adicionar atributo"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {contactAttributes
                            .filter(attr => !selectedAttributes.includes(attr.name))
                            .map((attr) => (
                              <SelectItem key={attr.id} value={attr.name}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: attr.color }}
                                  />
                                  {attr.name}
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Os atributos serão aplicados ao contato ao enviar a resposta
                      </p>
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={createResponse.isPending || updateResponse.isPending}
                        data-testid="button-save-canned-response"
                      >
                        {(createResponse.isPending || updateResponse.isPending) ? (
                          <LoadingSpinner size="sm" className="text-primary-foreground" />
                        ) : editingResponse ? (
                          "Salvar Alterações"
                        ) : (
                          "Criar Resposta"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <LoadingCard />
          ) : cannedResponses.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={MessageSquareText}
                  title="Nenhuma resposta rápida configurada"
                  description="Configure atalhos para enviar mensagens frequentes de forma rápida"
                  action={
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Resposta
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {cannedResponses.map((response) => (
                <Card key={response.id} data-testid={`canned-response-card-${response.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="secondary" className="font-mono">
                            /{response.shortcut}
                          </Badge>
                          {response.attributes && response.attributes.map((attr) => (
                            <Badge 
                              key={attr}
                              variant="outline" 
                              className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400"
                            >
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              {attr}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                          {response.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(response)}
                          data-testid={`button-edit-canned-response-${response.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-delete-canned-response-${response.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir Resposta Rápida</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir esta resposta rápida? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteResponse.mutate(response.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
