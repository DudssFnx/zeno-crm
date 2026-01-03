import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  Users,
  MessageSquare,
  Zap,
  Building2,
  Menu,
  AlertTriangle,
  Pencil,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Department, TriageMenu, AutomationRule, Tag, Stage, User } from "@shared/schema";

type TriageOption = {
  key: string;
  label: string;
  departmentId?: string;
  tagId?: string;
  stageId?: string;
  keywords?: string[];
};

export default function AutomationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("departments");

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: triageMenus = [] } = useQuery<TriageMenu[]>({
    queryKey: ["/api/triage-menus"],
  });

  const { data: automationRules = [] } = useQuery<AutomationRule[]>({
    queryKey: ["/api/automation-rules"],
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ["/api/stages"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: whatsappAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/whatsapp-accounts"],
  });

  if (user?.role === "operator") {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500" />
              <h2 className="text-xl font-semibold">Acesso Restrito</h2>
              <p className="text-muted-foreground">
                Apenas administradores podem configurar automacoes.
              </p>
              <Link href="/">
                <Button data-testid="button-back-home">Voltar ao Inbox</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 p-4 border-b">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Automacao Hibrida</h1>
          <p className="text-sm text-muted-foreground">
            Configure departamentos, triagem e regras de automacao
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="departments" className="gap-2" data-testid="tab-departments">
              <Building2 className="h-4 w-4" />
              Departamentos
            </TabsTrigger>
            <TabsTrigger value="triage" className="gap-2" data-testid="tab-triage">
              <Menu className="h-4 w-4" />
              Menu de Triagem
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2" data-testid="tab-rules">
              <Zap className="h-4 w-4" />
              Regras de Automacao
            </TabsTrigger>
          </TabsList>

          <TabsContent value="departments">
            <DepartmentsTab
              departments={departments}
              users={users}
            />
          </TabsContent>

          <TabsContent value="triage">
            <TriageMenusTab
              menus={triageMenus}
              departments={departments}
              tags={tags}
              stages={stages}
              whatsappAccounts={whatsappAccounts}
            />
          </TabsContent>

          <TabsContent value="rules">
            <AutomationRulesTab
              rules={automationRules}
              departments={departments}
              tags={tags}
              stages={stages}
              users={users}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DepartmentsTab({
  departments,
  users,
}: {
  departments: Department[];
  users: User[];
}) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/departments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setIsCreating(false);
      setNewName("");
      setNewDescription("");
      setNewKeywords("");
      setIsDefault(false);
      toast({ title: "Departamento criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar departamento", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/departments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "Departamento excluido" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir departamento", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({
      name: newName.trim(),
      description: newDescription.trim() || null,
      keywords: newKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      isDefault,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Departamentos</h2>
          <p className="text-sm text-muted-foreground">
            Organize sua equipe em departamentos para roteamento inteligente
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-department">
              <Plus className="h-4 w-4 mr-2" />
              Novo Departamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Departamento</DialogTitle>
              <DialogDescription>
                Configure um novo departamento para roteamento de conversas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Vendas, Suporte, Financeiro"
                  data-testid="input-department-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Descricao (opcional)</Label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Descreva a funcao do departamento"
                  data-testid="input-department-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Palavras-chave (separadas por virgula)</Label>
                <Input
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  placeholder="vendas, preco, comprar, orcamento"
                  data-testid="input-department-keywords"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  data-testid="switch-department-default"
                />
                <Label>Departamento padrao (fallback)</Label>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || createMutation.isPending}
                data-testid="button-save-department"
              >
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {departments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum departamento configurado</p>
            <p className="text-sm">Crie departamentos para organizar sua equipe</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <Card key={dept.id} data-testid={`card-department-${dept.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{dept.name}</CardTitle>
                  {dept.isDefault && <Badge variant="secondary">Padrao</Badge>}
                </div>
                {dept.description && (
                  <CardDescription>{dept.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {dept.keywords && dept.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dept.keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <DepartmentAgentsManager departmentId={dept.id} users={users} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(dept.id)}
                    data-testid={`button-delete-department-${dept.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DepartmentAgentsManager({
  departmentId,
  users,
}: {
  departmentId: string;
  users: User[];
}) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ["/api/departments", departmentId, "agents"],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${departmentId}/agents`);
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });

  const addAgentMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/departments/${departmentId}/agents`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments", departmentId, "agents"] });
      toast({ title: "Agente adicionado" });
    },
  });

  const removeAgentMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/departments/${departmentId}/agents/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments", departmentId, "agents"] });
      toast({ title: "Agente removido" });
    },
  });

  const agentUserIds = agents.map((a: any) => a.userId);
  const availableUsers = users.filter((u) => !agentUserIds.includes(u.id));

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          {agents.length} agentes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerenciar Agentes</DialogTitle>
          <DialogDescription>
            Adicione ou remova agentes deste departamento
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {availableUsers.length > 0 && (
            <div className="space-y-2">
              <Label>Adicionar Agente</Label>
              <Select onValueChange={(userId) => addAgentMutation.mutate(userId)}>
                <SelectTrigger data-testid="select-add-agent">
                  <SelectValue placeholder="Selecionar usuario" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Agentes Atuais</Label>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agente neste departamento</p>
            ) : (
              <div className="space-y-2">
                {agents.map((agent: any) => {
                  const agentUser = users.find((u) => u.id === agent.userId);
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-2 border rounded-md"
                    >
                      <span>{agentUser?.name || "Usuario desconhecido"}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAgentMutation.mutate(agent.userId)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TriageMenusTab({
  menus,
  departments,
  tags,
  stages,
  whatsappAccounts,
}: {
  menus: TriageMenu[];
  departments: Department[];
  tags: Tag[];
  stages: Stage[];
  whatsappAccounts: any[];
}) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [editingMenu, setEditingMenu] = useState<TriageMenu | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    welcomeMessage: "",
    humanOptionKey: "0",
    invalidMessage: "Desculpe, nao entendi. Por favor, escolha uma opcao valida.",
    timeoutMinutes: 30,
    isActive: true,
    triggerOnFirstMessage: true,
    whatsappAccountId: "",
    options: [] as TriageOption[],
  });

  const [newOption, setNewOption] = useState<Partial<TriageOption>>({
    key: "",
    label: "",
    departmentId: "",
    tagId: "",
    stageId: "",
    keywords: [],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/triage-menus", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/triage-menus"] });
      setIsCreating(false);
      setFormData({
        name: "",
        welcomeMessage: "",
        humanOptionKey: "0",
        invalidMessage: "Desculpe, nao entendi. Por favor, escolha uma opcao valida.",
        timeoutMinutes: 30,
        isActive: true,
        triggerOnFirstMessage: true,
        whatsappAccountId: "",
        options: [],
      });
      toast({ title: "Menu de triagem criado" });
    },
    onError: () => {
      toast({ title: "Erro ao criar menu", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/triage-menus/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/triage-menus"] });
      toast({ title: "Menu excluido" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/triage-menus/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/triage-menus"] });
      setEditingMenu(null);
      toast({ title: "Menu atualizado" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar menu", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/triage-menus/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/triage-menus"] });
    },
  });

  const openEditDialog = (menu: TriageMenu) => {
    setFormData({
      name: menu.name,
      welcomeMessage: menu.welcomeMessage,
      humanOptionKey: menu.humanOptionKey || "0",
      invalidMessage: menu.invalidMessage || "Desculpe, nao entendi. Por favor, escolha uma opcao valida.",
      timeoutMinutes: menu.timeoutMinutes || 30,
      isActive: menu.isActive,
      triggerOnFirstMessage: menu.triggerOnFirstMessage,
      whatsappAccountId: menu.whatsappAccountId || "",
      options: (menu.options as TriageOption[]) || [],
    });
    setEditingMenu(menu);
  };

  const handleUpdate = () => {
    if (!editingMenu) return;
    if (!formData.name.trim() || !formData.welcomeMessage.trim() || formData.options.length === 0) {
      toast({ title: "Preencha todos os campos obrigatorios", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingMenu.id,
      data: {
        ...formData,
        whatsappAccountId: formData.whatsappAccountId || null,
      },
    });
  };

  const closeEditDialog = () => {
    setEditingMenu(null);
    setFormData({
      name: "",
      welcomeMessage: "",
      humanOptionKey: "0",
      invalidMessage: "Desculpe, nao entendi. Por favor, escolha uma opcao valida.",
      timeoutMinutes: 30,
      isActive: true,
      triggerOnFirstMessage: true,
      whatsappAccountId: "",
      options: [],
    });
  };

  const addOption = () => {
    if (!newOption.key || !newOption.label) return;
    setFormData({
      ...formData,
      options: [...formData.options, newOption as TriageOption],
    });
    setNewOption({ key: "", label: "", departmentId: "", tagId: "", stageId: "", keywords: [] });
  };

  const removeOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index),
    });
  };

  const handleCreate = () => {
    if (!formData.name.trim() || !formData.welcomeMessage.trim() || formData.options.length === 0) {
      toast({ title: "Preencha todos os campos obrigatorios", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...formData,
      whatsappAccountId: formData.whatsappAccountId || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Menu de Triagem</h2>
          <p className="text-sm text-muted-foreground">
            Configure menus numerados para roteamento automatico de clientes
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-triage-menu">
              <Plus className="h-4 w-4 mr-2" />
              Novo Menu
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Menu de Triagem</DialogTitle>
              <DialogDescription>
                Configure um menu com opcoes numeradas para auto-atendimento
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Menu</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Menu Principal"
                    data-testid="input-menu-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Conta WhatsApp (opcional)</Label>
                  <Select
                    value={formData.whatsappAccountId || "all"}
                    onValueChange={(v) => setFormData({ ...formData, whatsappAccountId: v === "all" ? "" : v })}
                  >
                    <SelectTrigger data-testid="select-whatsapp-account">
                      <SelectValue placeholder="Todas as contas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as contas</SelectItem>
                      {whatsappAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mensagem de Boas-vindas</Label>
                <Textarea
                  value={formData.welcomeMessage}
                  onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                  placeholder="Ola! Bem-vindo ao nosso atendimento. Como posso ajudar?"
                  rows={3}
                  data-testid="input-welcome-message"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tecla para Atendente Humano</Label>
                  <Input
                    value={formData.humanOptionKey}
                    onChange={(e) => setFormData({ ...formData, humanOptionKey: e.target.value })}
                    placeholder="0"
                    data-testid="input-human-key"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout (minutos)</Label>
                  <Input
                    type="number"
                    value={formData.timeoutMinutes}
                    onChange={(e) => setFormData({ ...formData, timeoutMinutes: parseInt(e.target.value) || 30 })}
                    data-testid="input-timeout"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mensagem para Opcao Invalida</Label>
                <Input
                  value={formData.invalidMessage}
                  onChange={(e) => setFormData({ ...formData, invalidMessage: e.target.value })}
                  data-testid="input-invalid-message"
                />
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                    data-testid="switch-menu-active"
                  />
                  <Label>Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.triggerOnFirstMessage}
                    onCheckedChange={(v) => setFormData({ ...formData, triggerOnFirstMessage: v })}
                    data-testid="switch-trigger-first"
                  />
                  <Label>Disparar na primeira mensagem</Label>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Opcoes do Menu</h3>
                <div className="space-y-3">
                  {formData.options.map((opt, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 border rounded-md"
                    >
                      <Badge>{opt.key}</Badge>
                      <span className="flex-1">{opt.label}</span>
                      {opt.departmentId && (
                        <Badge variant="outline">
                          {departments.find((d) => d.id === opt.departmentId)?.name}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 border rounded-md space-y-3 bg-muted/50">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm">Tecla</Label>
                      <Input
                        value={newOption.key}
                        onChange={(e) => setNewOption({ ...newOption, key: e.target.value })}
                        placeholder="1"
                        data-testid="input-option-key"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Texto</Label>
                      <Input
                        value={newOption.label}
                        onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                        placeholder="Vendas"
                        data-testid="input-option-label"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm">Departamento</Label>
                      <Select
                        value={newOption.departmentId || "none"}
                        onValueChange={(v) => setNewOption({ ...newOption, departmentId: v === "none" ? undefined : v })}
                      >
                        <SelectTrigger data-testid="select-option-department">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Tag</Label>
                      <Select
                        value={newOption.tagId || "none"}
                        onValueChange={(v) => setNewOption({ ...newOption, tagId: v === "none" ? undefined : v })}
                      >
                        <SelectTrigger data-testid="select-option-tag">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {tags.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Estagio</Label>
                      <Select
                        value={newOption.stageId || "none"}
                        onValueChange={(v) => setNewOption({ ...newOption, stageId: v === "none" ? undefined : v })}
                      >
                        <SelectTrigger data-testid="select-option-stage">
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {stages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={addOption}
                    disabled={!newOption.key || !newOption.label}
                    data-testid="button-add-option"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Opcao
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                data-testid="button-save-menu"
              >
                Criar Menu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {menus.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Menu className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum menu de triagem configurado</p>
            <p className="text-sm">Crie um menu para auto-atendimento inicial</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {menus.map((menu) => (
            <Card key={menu.id} data-testid={`card-menu-${menu.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{menu.name}</CardTitle>
                    <Badge variant={menu.isActive ? "default" : "secondary"}>
                      {menu.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={menu.isActive}
                      onCheckedChange={(isActive) =>
                        toggleMutation.mutate({ id: menu.id, isActive })
                      }
                      data-testid={`switch-menu-${menu.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(menu)}
                      data-testid={`button-edit-menu-${menu.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(menu.id)}
                      data-testid={`button-delete-menu-${menu.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-3">
                  {menu.welcomeMessage.substring(0, 100)}...
                </div>
                <div className="flex flex-wrap gap-2">
                  {(menu.options as TriageOption[]).map((opt, idx) => (
                    <Badge key={idx} variant="outline">
                      {opt.key} - {opt.label}
                    </Badge>
                  ))}
                  <Badge variant="outline">
                    {menu.humanOptionKey} - Atendente
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingMenu} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Menu de Triagem</DialogTitle>
            <DialogDescription>
              Modifique as configuracoes do menu
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Menu</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Menu Principal"
                  data-testid="input-edit-menu-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Conta WhatsApp (opcional)</Label>
                <Select
                  value={formData.whatsappAccountId || "all"}
                  onValueChange={(v) => setFormData({ ...formData, whatsappAccountId: v === "all" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-edit-whatsapp-account">
                    <SelectValue placeholder="Todas as contas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {whatsappAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mensagem de Boas-vindas</Label>
              <Textarea
                value={formData.welcomeMessage}
                onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                placeholder="Ola! Bem-vindo ao nosso atendimento. Como posso ajudar?"
                rows={4}
                data-testid="input-edit-welcome-message"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tecla para Atendente</Label>
                <Input
                  value={formData.humanOptionKey}
                  onChange={(e) => setFormData({ ...formData, humanOptionKey: e.target.value })}
                  placeholder="0"
                  data-testid="input-edit-human-key"
                />
              </div>
              <div className="space-y-2">
                <Label>Timeout (minutos)</Label>
                <Input
                  type="number"
                  value={formData.timeoutMinutes}
                  onChange={(e) => setFormData({ ...formData, timeoutMinutes: parseInt(e.target.value) || 30 })}
                  data-testid="input-edit-timeout"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mensagem de Opcao Invalida</Label>
              <Input
                value={formData.invalidMessage}
                onChange={(e) => setFormData({ ...formData, invalidMessage: e.target.value })}
                placeholder="Opcao invalida. Tente novamente."
                data-testid="input-edit-invalid-message"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  data-testid="switch-edit-active"
                />
                <Label>Menu Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.triggerOnFirstMessage}
                  onCheckedChange={(checked) => setFormData({ ...formData, triggerOnFirstMessage: checked })}
                  data-testid="switch-edit-trigger-first"
                />
                <Label>Disparar na primeira mensagem</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Opcoes do Menu</Label>
              <div className="space-y-2">
                {formData.options.map((opt, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 border rounded-md"
                  >
                    <Badge>{opt.key}</Badge>
                    <span className="flex-1">{opt.label}</span>
                    {opt.tagId && (
                      <Badge variant="outline" style={{ backgroundColor: tags.find((t) => t.id === opt.tagId)?.color }}>
                        {tags.find((t) => t.id === opt.tagId)?.name}
                      </Badge>
                    )}
                    {opt.departmentId && (
                      <Badge variant="outline">
                        {departments.find((d) => d.id === opt.departmentId)?.name}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOption(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 border rounded-md space-y-3 bg-muted/50">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Tecla</Label>
                    <Input
                      value={newOption.key}
                      onChange={(e) => setNewOption({ ...newOption, key: e.target.value })}
                      placeholder="1"
                      data-testid="input-edit-option-key"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Texto</Label>
                    <Input
                      value={newOption.label}
                      onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                      placeholder="Vendas"
                      data-testid="input-edit-option-label"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Departamento</Label>
                    <Select
                      value={newOption.departmentId || "none"}
                      onValueChange={(v) => setNewOption({ ...newOption, departmentId: v === "none" ? undefined : v })}
                    >
                      <SelectTrigger data-testid="select-edit-option-department">
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Tag</Label>
                    <Select
                      value={newOption.tagId || "none"}
                      onValueChange={(v) => setNewOption({ ...newOption, tagId: v === "none" ? undefined : v })}
                    >
                      <SelectTrigger data-testid="select-edit-option-tag">
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {tags.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Estagio</Label>
                    <Select
                      value={newOption.stageId || "none"}
                      onValueChange={(v) => setNewOption({ ...newOption, stageId: v === "none" ? undefined : v })}
                    >
                      <SelectTrigger data-testid="select-edit-option-stage">
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={addOption}
                  disabled={!newOption.key || !newOption.label}
                  data-testid="button-edit-add-option"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Opcao
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              data-testid="button-update-menu"
            >
              Salvar Alteracoes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AutomationRulesTab({
  rules,
  departments,
  tags,
  stages,
  users,
}: {
  rules: AutomationRule[];
  departments: Department[];
  tags: Tag[];
  stages: Stage[];
  users: User[];
}) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    triggerEvent: "message_received",
    triggerFilters: {} as Record<string, string | number>,
    actions: [] as Array<{ type: string; value?: string }>,
    priority: 0,
  });
  const [newAction, setNewAction] = useState({ type: "add_tag", value: "" });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/automation-rules", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Regra criada com sucesso!" });
      setShowCreateDialog(false);
      setFormData({
        name: "",
        description: "",
        triggerEvent: "message_received",
        triggerFilters: {},
        actions: [],
        priority: 0,
      });
    },
    onError: () => {
      toast({ title: "Erro ao criar regra", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/automation-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Regra excluida" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/automation-rules/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
    },
  });

  const triggerEventLabels: Record<string, string> = {
    message_received: "Mensagem Recebida",
    conversation_created: "Conversa Criada",
    tag_added: "Tag Adicionada",
    stage_changed: "Estagio Alterado",
    inactivity: "Inatividade",
  };

  const actionTypeLabels: Record<string, string> = {
    add_tag: "Adicionar Tag",
    remove_tag: "Remover Tag",
    set_stage: "Definir Estagio",
    assign_user: "Atribuir Atendente",
    assign_department: "Atribuir Departamento",
    send_message: "Enviar Mensagem",
  };

  const addAction = () => {
    if (!newAction.type) return;
    const actionValue = newAction.value === "none" ? undefined : newAction.value;
    setFormData({
      ...formData,
      actions: [...formData.actions, { type: newAction.type, value: actionValue }],
    });
    setNewAction({ type: "add_tag", value: "" });
  };

  const removeAction = (index: number) => {
    setFormData({
      ...formData,
      actions: formData.actions.filter((_, i) => i !== index),
    });
  };

  const getActionValueLabel = (action: { type: string; value?: string }) => {
    if (!action.value) return "";
    if (action.type === "add_tag" || action.type === "remove_tag") {
      return tags.find((t) => t.id === action.value)?.name || action.value;
    }
    if (action.type === "set_stage") {
      return stages.find((s) => s.id === action.value)?.name || action.value;
    }
    if (action.type === "assign_user") {
      return users.find((u) => u.id === action.value)?.name || action.value;
    }
    if (action.type === "assign_department") {
      return departments.find((d) => d.id === action.value)?.name || action.value;
    }
    return action.value;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Regras de Automacao</h2>
          <p className="text-sm text-muted-foreground">
            Regras baseadas em eventos (estilo Zoho) para automacao avancada
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-rule">
          <Plus className="h-4 w-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Regra de Automacao</DialogTitle>
            <DialogDescription>
              Configure uma regra para executar acoes automaticamente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome da Regra *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Marcar cliente ativo"
                  data-testid="input-rule-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  data-testid="input-rule-priority"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva o que esta regra faz..."
                data-testid="input-rule-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Evento Gatilho *</Label>
              <Select
                value={formData.triggerEvent}
                onValueChange={(v) => setFormData({ ...formData, triggerEvent: v })}
              >
                <SelectTrigger data-testid="select-rule-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(triggerEventLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.triggerEvent === "inactivity" && (
              <div className="space-y-2">
                <Label>Dias de Inatividade</Label>
                <Input
                  type="number"
                  value={(formData.triggerFilters.inactivityDays as number) || 3}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      triggerFilters: { ...formData.triggerFilters, inactivityDays: parseInt(e.target.value) || 3 },
                    })
                  }
                  placeholder="3"
                  data-testid="input-inactivity-days"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Acoes</Label>
              <div className="space-y-2">
                {formData.actions.map((action, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <Badge variant="outline">{actionTypeLabels[action.type]}</Badge>
                    {action.value && (
                      <span className="text-sm">{getActionValueLabel(action)}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto"
                      onClick={() => removeAction(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Select
                  value={newAction.type}
                  onValueChange={(v) => setNewAction({ ...newAction, type: v, value: "" })}
                >
                  <SelectTrigger className="flex-1" data-testid="select-action-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(actionTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(newAction.type === "add_tag" || newAction.type === "remove_tag") && (
                  <Select
                    value={newAction.value || "none"}
                    onValueChange={(v) => setNewAction({ ...newAction, value: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-action-tag">
                      <SelectValue placeholder="Selecione a tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione...</SelectItem>
                      {tags.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {newAction.type === "set_stage" && (
                  <Select
                    value={newAction.value || "none"}
                    onValueChange={(v) => setNewAction({ ...newAction, value: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-action-stage">
                      <SelectValue placeholder="Selecione o estagio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione...</SelectItem>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {newAction.type === "assign_user" && (
                  <Select
                    value={newAction.value || "none"}
                    onValueChange={(v) => setNewAction({ ...newAction, value: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-action-user">
                      <SelectValue placeholder="Selecione o atendente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione...</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {newAction.type === "assign_department" && (
                  <Select
                    value={newAction.value || "none"}
                    onValueChange={(v) => setNewAction({ ...newAction, value: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-action-department">
                      <SelectValue placeholder="Selecione o departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione...</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {newAction.type === "send_message" && (
                  <Input
                    value={newAction.value}
                    onChange={(e) => setNewAction({ ...newAction, value: e.target.value })}
                    placeholder="Mensagem a enviar..."
                    className="flex-1"
                    data-testid="input-action-message"
                  />
                )}
                <Button
                  variant="outline"
                  onClick={addAction}
                  disabled={!newAction.type || (newAction.type !== "send_message" && !newAction.value)}
                  data-testid="button-add-action"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={createMutation.isPending || !formData.name || formData.actions.length === 0}
              data-testid="button-save-rule"
            >
              Criar Regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma regra de automacao configurada</p>
            <p className="text-sm">
              Regras permitem acoes automaticas baseadas em eventos como inatividade,
              mudanca de status, etc.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{rule.name}</CardTitle>
                    {rule.description && (
                      <CardDescription>{rule.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{rule.triggerEvent}</Badge>
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={(isActive) =>
                        toggleMutation.mutate({ id: rule.id, isActive })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(rule.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
