import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, UserCircle } from "lucide-react";
import { useAuthFetch } from "@/lib/auth";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ContactAttribute } from "@shared/schema";

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

export default function AttributesSettingsPage() {
  const { toast } = useToast();
  const authFetch = useAuthFetch();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAttr, setEditingAttr] = useState<ContactAttribute | null>(null);
  const [deleteConfirmAttr, setDeleteConfirmAttr] = useState<ContactAttribute | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);

  const { data: attributes = [], isLoading } = useQuery<ContactAttribute[]>({
    queryKey: ["/api/contact-attributes"],
    queryFn: async () => {
      const res = await authFetch("/api/contact-attributes");
      if (!res.ok) throw new Error("Falha ao buscar atributos");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      return apiRequest("POST", "/api/contact-attributes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-attributes"] });
      toast({ title: "Atributo criado com sucesso" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Erro ao criar atributo", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; color: string } }) => {
      return apiRequest("PUT", `/api/contact-attributes/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-attributes"] });
      toast({ title: "Atributo atualizado com sucesso" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar atributo", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/contact-attributes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-attributes"] });
      toast({ title: "Atributo excluído com sucesso" });
      setDeleteConfirmAttr(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir atributo", variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingAttr(null);
    setFormName("");
    setFormColor(PRESET_COLORS[0]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (attr: ContactAttribute) => {
    setEditingAttr(attr);
    setFormName(attr.name);
    setFormColor(attr.color);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAttr(null);
    setFormName("");
    setFormColor(PRESET_COLORS[0]);
  };

  const handleSubmit = () => {
    if (!formName.trim()) return;

    if (editingAttr) {
      updateMutation.mutate({
        id: editingAttr.id,
        data: { name: formName.trim(), color: formColor },
      });
    } else {
      createMutation.mutate({ name: formName.trim(), color: formColor });
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <UserCircle className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-semibold">Atributos de Contato</h1>
            </div>
            <Button onClick={openCreateDialog} data-testid="button-create-attribute">
              <Plus className="h-4 w-4 mr-2" />
              Novo Atributo
            </Button>
          </div>

          <p className="text-muted-foreground mb-6">
            Crie atributos personalizados para classificar seus contatos (ex: Cliente, Fornecedor, Lead, VIP).
          </p>

          {isLoading ? (
            <LoadingCard />
          ) : attributes.length === 0 ? (
            <EmptyState
              icon={UserCircle}
              title="Nenhum atributo configurado"
              description="Crie atributos personalizados para classificar seus contatos."
              action={
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Atributo
                </Button>
              }
            />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Atributos ({attributes.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {attributes.map((attr) => (
                  <div
                    key={attr.id}
                    className="flex items-center gap-3 p-3 bg-card border rounded-lg"
                    data-testid={`attribute-item-${attr.id}`}
                  >
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: attr.color }}
                    />
                    <span className="flex-1 font-medium text-sm">{attr.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(attr)}
                        data-testid={`button-edit-${attr.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirmAttr(attr)}
                        data-testid={`button-delete-${attr.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAttr ? "Editar Atributo" : "Novo Atributo"}
            </DialogTitle>
            <DialogDescription>
              {editingAttr
                ? "Atualize as informações do atributo."
                : "Crie um novo atributo para classificar contatos."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Atributo</Label>
              <Input
                id="name"
                placeholder="Ex: Cliente, Fornecedor, Lead..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                data-testid="input-attribute-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formColor === color
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                    data-testid={`color-${color.replace("#", "")}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-attribute"
            >
              {editingAttr ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteConfirmAttr}
        onOpenChange={(open) => !open && setDeleteConfirmAttr(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atributo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o atributo "{deleteConfirmAttr?.name}"?
              Contatos com este atributo ficarão sem classificação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmAttr && deleteMutation.mutate(deleteConfirmAttr.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
