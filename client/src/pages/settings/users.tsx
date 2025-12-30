import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users, Shield, User as UserIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "../dashboard";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

const userFormSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Digite um email válido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional().or(z.literal("")),
  role: z.enum(["admin", "operator"]),
  displayName: z.string().optional(),
});

type UserFormData = z.infer<typeof userFormSchema>;

export default function UsersPage() {
  const authFetch = useAuthFetch();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: "", email: "", password: "", role: "operator", displayName: "" },
  });

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await authFetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const createUser = useMutation({
    mutationFn: async (data: UserFormData) => {
      const res = await authFetch("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Usuário criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar usuário", variant: "destructive" });
    },
  });

  const updateUser = useMutation({
    mutationFn: async (data: UserFormData & { id: string }) => {
      const payload: Record<string, string> = {
        name: data.name,
        email: data.email,
        role: data.role,
      };
      if (data.password) {
        payload.password = data.password;
      }
      const res = await authFetch(`/api/users/${data.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsDialogOpen(false);
      setEditingUser(null);
      form.reset();
      toast({ title: "Usuário atualizado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar usuário", variant: "destructive" });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário excluído com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir usuário", variant: "destructive" });
    },
  });

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      form.reset({
        name: user.name,
        email: user.email,
        password: "",
        role: (user.role === "admin" || user.role === "operator") ? user.role : "operator",
        displayName: user.displayName || "",
      });
    } else {
      setEditingUser(null);
      form.reset({ name: "", email: "", password: "", role: "operator", displayName: "" });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: UserFormData) => {
    if (editingUser) {
      updateUser.mutate({ ...data, id: editingUser.id });
    } else {
      createUser.mutate(data);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Equipe</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Gerencie o acesso e funções da sua equipe
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-user">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
                  <DialogDescription>
                    {editingUser
                      ? "Atualize as informações do usuário. Deixe a senha em branco para manter a atual."
                      : "Adicione um novo membro à sua equipe."}
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
                            <Input {...field} placeholder="João Silva" data-testid="input-user-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder="joao@exemplo.com" data-testid="input-user-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{editingUser ? "Nova Senha (opcional)" : "Senha"}</FormLabel>
                          <FormControl>
                            <Input {...field} type="password" placeholder="••••••" data-testid="input-user-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome de Exibição (mostrado nas mensagens)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Nome mostrado aos clientes" data-testid="input-user-displayname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Função</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-user-role">
                                <SelectValue placeholder="Selecione a função" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {currentUser?.role === "master" && (
                                <SelectItem value="admin">Administrador</SelectItem>
                              )}
                              <SelectItem value="operator">Operador</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={createUser.isPending || updateUser.isPending}
                        data-testid="button-save-user"
                      >
                        {(createUser.isPending || updateUser.isPending) ? (
                          <LoadingSpinner size="sm" className="text-primary-foreground" />
                        ) : editingUser ? (
                          "Salvar Alterações"
                        ) : (
                          "Adicionar Usuário"
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
          ) : users.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Users}
                  title="Nenhum membro na equipe"
                  description="Adicione o primeiro membro para começar"
                  action={
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Usuário
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between gap-4 p-4"
                      data-testid={`user-row-${user.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <AvatarWithFallback name={user.name} size="md" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{user.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {user.role === "master" ? (
                                <span className="flex items-center gap-1">
                                  <Shield className="h-3 w-3" />
                                  Master
                                </span>
                              ) : user.role === "admin" ? (
                                <span className="flex items-center gap-1">
                                  <Shield className="h-3 w-3" />
                                  Administrador
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <UserIcon className="h-3 w-3" />
                                  Operador
                                </span>
                              )}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          {user.displayName && (
                            <p className="text-xs text-muted-foreground">Exibição: {user.displayName}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(user)}
                          data-testid={`button-edit-user-${user.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {user.id !== currentUser?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-delete-user-${user.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir {user.name}? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteUser.mutate(user.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
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
