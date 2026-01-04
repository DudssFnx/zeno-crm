import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Building2, Users, MessageSquare, Phone, Globe, Calendar, CheckCircle, XCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

interface CompanyWithStats extends Company {
  userCount: number;
  whatsappAccountCount: number;
  contactCount: number;
}

const companyFormSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  domain: z.string().optional(),
  plan: z.enum(["basic", "pro", "enterprise"]),
  maxUsers: z.number().min(1).max(100),
  maxWhatsappAccounts: z.number().min(1).max(20),
  expiresAt: z.string().optional(),
  isActive: z.boolean(),
  adminName: z.string().optional(),
  adminEmail: z.string().email().optional().or(z.literal("")),
  adminPassword: z.string().min(6).optional().or(z.literal("")),
});

type CompanyFormData = z.infer<typeof companyFormSchema>;

const planLabels: Record<string, { label: string; color: string }> = {
  basic: { label: "Basico", color: "bg-gray-500" },
  pro: { label: "Pro", color: "bg-blue-500" },
  enterprise: { label: "Enterprise", color: "bg-purple-500" },
};

export default function MasterCompaniesPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyWithStats | null>(null);

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: "",
      domain: "",
      plan: "basic",
      maxUsers: 5,
      maxWhatsappAccounts: 2,
      expiresAt: "",
      isActive: true,
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    },
  });

  const { data: companies = [], isLoading } = useQuery<CompanyWithStats[]>({
    queryKey: ["/api/master/companies"],
    queryFn: async () => {
      const res = await authFetch("/api/master/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      return res.json();
    },
  });

  const createCompany = useMutation({
    mutationFn: async (data: CompanyFormData) => {
      const res = await authFetch("/api/master/companies", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create company");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/companies"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Empresa criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar empresa", variant: "destructive" });
    },
  });

  const updateCompany = useMutation({
    mutationFn: async (data: CompanyFormData & { id: string }) => {
      const res = await authFetch(`/api/master/companies/${data.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update company");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/companies"] });
      setIsDialogOpen(false);
      setEditingCompany(null);
      form.reset();
      toast({ title: "Empresa atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar empresa", variant: "destructive" });
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/master/companies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete company");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/companies"] });
      toast({ title: "Empresa excluida com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao excluir empresa", variant: "destructive" });
    },
  });

  const handleOpenDialog = (company?: CompanyWithStats) => {
    if (company) {
      setEditingCompany(company);
      form.reset({
        name: company.name,
        domain: company.domain || "",
        plan: (company.plan as "basic" | "pro" | "enterprise") || "basic",
        maxUsers: company.maxUsers || 5,
        maxWhatsappAccounts: company.maxWhatsappAccounts || 2,
        expiresAt: company.expiresAt ? new Date(company.expiresAt).toISOString().split("T")[0] : "",
        isActive: company.isActive,
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
    } else {
      setEditingCompany(null);
      form.reset({
        name: "",
        domain: "",
        plan: "basic",
        maxUsers: 5,
        maxWhatsappAccounts: 2,
        expiresAt: "",
        isActive: true,
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: CompanyFormData) => {
    if (editingCompany) {
      updateCompany.mutate({ ...data, id: editingCompany.id });
    } else {
      createCompany.mutate(data);
    }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "Sem validade";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                Painel Master - Empresas
              </h1>
              <p className="text-muted-foreground">
                Gerencie as empresas cadastradas no sistema
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-company">
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Empresa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingCompany ? "Editar Empresa" : "Nova Empresa"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingCompany
                      ? "Atualize as informacoes da empresa"
                      : "Preencha os dados para criar uma nova empresa"}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome da Empresa</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Loja ABC" {...field} data-testid="input-company-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="domain"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dominio</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: lojaabc.zeno.com.br" {...field} data-testid="input-company-domain" />
                            </FormControl>
                            <FormDescription>Dominio personalizado (opcional)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="plan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plano</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-company-plan">
                                  <SelectValue placeholder="Selecione o plano" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="basic">Basico</SelectItem>
                                <SelectItem value="pro">Pro</SelectItem>
                                <SelectItem value="enterprise">Enterprise</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="maxUsers"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max. Usuarios</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                data-testid="input-max-users"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="maxWhatsappAccounts"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max. WhatsApp</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={20}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                data-testid="input-max-whatsapp"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="expiresAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data de Expiracao</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-expires-at" />
                            </FormControl>
                            <FormDescription>Deixe vazio para sem validade</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Empresa Ativa</FormLabel>
                              <FormDescription>
                                Desativar impede o acesso
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-is-active"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {!editingCompany && (
                      <>
                        <div className="border-t pt-4">
                          <h3 className="text-sm font-medium mb-3">Usuario Administrador (opcional)</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField
                              control={form.control}
                              name="adminName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Nome</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Nome do admin" {...field} data-testid="input-admin-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="adminEmail"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email</FormLabel>
                                  <FormControl>
                                    <Input type="email" placeholder="admin@empresa.com" {...field} data-testid="input-admin-email" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="adminPassword"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Senha</FormLabel>
                                  <FormControl>
                                    <Input type="password" placeholder="Senha" {...field} data-testid="input-admin-password" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={createCompany.isPending || updateCompany.isPending}
                        data-testid="button-submit-company"
                      >
                        {(createCompany.isPending || updateCompany.isPending) && (
                          <LoadingSpinner className="w-4 h-4 mr-2" />
                        )}
                        {editingCompany ? "Salvar" : "Criar Empresa"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Nenhuma empresa cadastrada"
              description="Adicione a primeira empresa para comecar"
              action={
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Empresa
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <Card key={company.id} data-testid={`card-company-${company.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate flex items-center gap-2">
                          {company.isActive ? (
                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                          {company.name}
                        </CardTitle>
                        {company.domain && (
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <Globe className="w-3 h-3" />
                            {company.domain}
                          </CardDescription>
                        )}
                      </div>
                      <Badge
                        className={`${planLabels[company.plan || "basic"].color} text-white`}
                      >
                        {planLabels[company.plan || "basic"].label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{company.userCount}/{company.maxUsers}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        <span>{company.whatsappAccountCount}/{company.maxWhatsappAccounts}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MessageSquare className="w-4 h-4" />
                        <span>{company.contactCount}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>Expira: {formatDate(company.expiresAt)}</span>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDialog(company)}
                        className="flex-1"
                        data-testid={`button-edit-company-${company.id}`}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="destructive"
                            data-testid={`button-delete-company-${company.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acao nao pode ser desfeita. Todos os dados da empresa "{company.name}" serao perdidos permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteCompany.mutate(company.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
