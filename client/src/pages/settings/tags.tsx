import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DashboardLayout } from "../dashboard";
import { TagChip } from "@/components/tag-chip";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Tag as TagType } from "@shared/schema";

const tagFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Digite uma cor hexadecimal válida"),
  stageOrder: z.string().optional(),
});

type TagFormData = z.infer<typeof tagFormSchema>;

const presetColors = [
  // Vermelhos e Rosas
  "#FF0000", "#DC2626", "#E11D48", "#BE185D", "#9D174D",
  // Laranjas
  "#FF6B00", "#EA580C", "#D97706", "#B45309",
  // Amarelos e Dourados
  "#FFC107", "#FACC15", "#CA8A04", "#A16207",
  // Verdes Claros
  "#84CC16", "#65A30D", "#4D7C0F", "#BEF264",
  // Verdes
  "#22C55E", "#16A34A", "#15803D", "#166534", "#00FF7F",
  // Teals e Cyans
  "#14B8A6", "#0D9488", "#0F766E", "#06B6D4", "#00CED1",
  // Azuis Claros
  "#0EA5E9", "#0284C7", "#0369A1", "#7DD3FC",
  // Azuis
  "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#1565C0",
  // Indigos
  "#6366F1", "#4F46E5", "#4338CA", "#3730A3",
  // Roxos
  "#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6",
  // Magentas e Fúcsias
  "#A855F7", "#9333EA", "#D946EF", "#C026D3", "#A21CAF",
  // Rosas
  "#EC4899", "#DB2777", "#BE185D", "#F472B6",
  // Marrons
  "#92400E", "#78350F", "#A3623A", "#8B4513",
  // Cinzas
  "#6B7280", "#4B5563", "#374151", "#9CA3AF",
  // Especiais
  "#000000", "#1E293B", "#334155", "#475569",
];

export default function TagsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);

  const form = useForm<TagFormData>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: { name: "", color: "#3B82F6", stageOrder: "" },
  });

  const { data: tags = [], isLoading } = useQuery<TagType[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  const createTag = useMutation({
    mutationFn: async (data: TagFormData) => {
      const res = await authFetch("/api/tags", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          color: data.color,
          stageOrder: data.stageOrder || null,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Etiqueta criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar etiqueta", variant: "destructive" });
    },
  });

  const updateTag = useMutation({
    mutationFn: async (data: TagFormData & { id: string }) => {
      const res = await authFetch(`/api/tags/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          color: data.color,
          stageOrder: data.stageOrder || null,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setIsDialogOpen(false);
      setEditingTag(null);
      form.reset();
      toast({ title: "Etiqueta atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar etiqueta", variant: "destructive" });
    },
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/tags/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      toast({ title: "Etiqueta excluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir etiqueta", variant: "destructive" });
    },
  });

  const handleOpenDialog = (tag?: TagType) => {
    if (tag) {
      setEditingTag(tag);
      form.reset({ name: tag.name, color: tag.color, stageOrder: tag.stageOrder || "" });
    } else {
      setEditingTag(null);
      form.reset({ name: "", color: "#3B82F6", stageOrder: "" });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: TagFormData) => {
    if (editingTag) {
      updateTag.mutate({ ...data, id: editingTag.id });
    } else {
      createTag.mutate(data);
    }
  };

  const selectedColor = form.watch("color");

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Etiquetas</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Organize contatos com etiquetas e estágios do funil
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-tag">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Etiqueta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTag ? "Editar Etiqueta" : "Nova Etiqueta"}</DialogTitle>
                  <DialogDescription>
                    {editingTag
                      ? "Atualize o nome e cor da etiqueta."
                      : "Crie uma etiqueta para organizar seus contatos."}
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
                            <Input {...field} placeholder="Novo Lead" data-testid="input-tag-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cor</FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              <div className="flex gap-2 flex-wrap">
                                {presetColors.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={() => form.setValue("color", color)}
                                    className={`w-8 h-8 rounded-full transition-transform ${
                                      selectedColor === color ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
                                    }`}
                                    style={{ backgroundColor: color }}
                                    data-testid={`color-${color}`}
                                  />
                                ))}
                              </div>
                              <Input
                                {...field}
                                placeholder="#3B82F6"
                                data-testid="input-tag-color"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="stageOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ordem do Estágio (opcional)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              placeholder="1, 2, 3..."
                              data-testid="input-tag-stage-order"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Defina um número para mostrar esta etiqueta como coluna no Kanban
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="pt-2">
                      <p className="text-sm text-muted-foreground mb-2">Prévia:</p>
                      <TagChip
                        tag={{ id: "preview", name: form.watch("name") || "Nome da Etiqueta", color: selectedColor, companyId: "", createdAt: new Date(), updatedAt: new Date(), stageOrder: null }}
                        size="md"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={createTag.isPending || updateTag.isPending}
                        data-testid="button-save-tag"
                      >
                        {(createTag.isPending || updateTag.isPending) ? (
                          <LoadingSpinner size="sm" className="text-primary-foreground" />
                        ) : editingTag ? (
                          "Salvar Alterações"
                        ) : (
                          "Criar Etiqueta"
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
          ) : tags.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Tag}
                  title="Nenhuma etiqueta ainda"
                  description="Crie etiquetas para organizar seus contatos e acompanhar estágios do funil"
                  action={
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Etiqueta
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between gap-4 p-4"
                      data-testid={`tag-row-${tag.id}`}
                    >
                      <TagChip tag={tag} size="md" />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(tag)}
                          data-testid={`button-edit-tag-${tag.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-delete-tag-${tag.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir Etiqueta</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir esta etiqueta? Ela será removida de todos os contatos.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteTag.mutate(tag.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
