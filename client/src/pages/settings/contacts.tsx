import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Phone, MessageSquare, Users, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardLayout } from "../dashboard";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { formatPhoneNumber, formatTimeAgo, getInactivityColor, cn } from "@/lib/utils";
import { AttributeChip } from "@/components/attribute-chip";
import type { Contact, WhatsappAccount } from "@shared/schema";

const startConversationSchema = z.object({
  phoneNumber: z.string().min(10, "Digite um número de telefone válido"),
  whatsappAccountId: z.string().min(1, "Selecione uma conta WhatsApp"),
  name: z.string().optional(),
});

type StartConversationData = z.infer<typeof startConversationSchema>;

export default function ContactsPage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const isOperator = user?.role === "operator";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [attributeFilter, setAttributeFilter] = useState<string>("all");
  const [inactivityFilter, setInactivityFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [contactToMessage, setContactToMessage] = useState<Contact | null>(null);
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false);

  const form = useForm<StartConversationData>({
    resolver: zodResolver(startConversationSchema),
    defaultValues: { phoneNumber: "", whatsappAccountId: "", name: "" },
  });

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", searchQuery],
    queryFn: async () => {
      const url = searchQuery ? `/api/contacts?search=${encodeURIComponent(searchQuery)}` : "/api/contacts";
      const res = await authFetch(url);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  const { data: accounts = [] } = useQuery<WhatsappAccount[]>({
    queryKey: ["/api/whatsapp-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/whatsapp-accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
  });

  const connectedAccounts = accounts.filter(a => a.status === "connected");

  const { data: contactAttributes = [] } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ["/api/contact-attributes"],
    queryFn: async () => {
      const res = await authFetch("/api/contact-attributes");
      if (!res.ok) throw new Error("Failed to fetch attributes");
      return res.json();
    },
  });

  const filteredContacts = contacts.filter((contact) => {
    if (attributeFilter !== "all") {
      if (attributeFilter === "has_any") {
        if (!contact.attributes || contact.attributes.length === 0) return false;
      } else {
        const hasAttr = contact.attributes?.some(attr => 
          attr.toLowerCase() === attributeFilter.toLowerCase()
        );
        if (!hasAttr) return false;
      }
    }
    
    if (inactivityFilter !== "all") {
      const lastInbound = (contact as { lastInboundAt?: string | null }).lastInboundAt;
      if (inactivityFilter === "never_inbound") {
        if (lastInbound) return false;
      } else {
        if (!lastInbound) return false;
        const date = new Date(lastInbound);
        const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        switch (inactivityFilter) {
          case "0_1": if (diffDays > 1) return false; break;
          case "2_3": if (diffDays < 2 || diffDays > 3) return false; break;
          case "4_7": if (diffDays < 4 || diffDays > 7) return false; break;
          case "8_15": if (diffDays < 8 || diffDays > 15) return false; break;
          case "16_30": if (diffDays < 16 || diffDays > 30) return false; break;
          case "30_plus": if (diffDays < 30) return false; break;
        }
      }
    }
    
    return true;
  });

  const startConversation = useMutation({
    mutationFn: async (data: StartConversationData) => {
      const res = await authFetch("/api/contacts/start-conversation", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to start conversation");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setIsDialogOpen(false);
      setIsAccountSelectorOpen(false);
      setContactToMessage(null);
      form.reset();
      toast({ title: "Conversa iniciada" });
      setLocation(`/?conversation=${data.conversation.id}`);
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao iniciar conversa", variant: "destructive" });
    },
  });

  const deleteContacts = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await authFetch("/api/contacts", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to delete contacts");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setSelectedContacts(new Set());
      setIsDeleteDialogOpen(false);
      toast({ title: "Contatos apagados com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao apagar contatos", variant: "destructive" });
    },
  });

  const handleStartConversation = (data: StartConversationData) => {
    startConversation.mutate(data);
  };

  const handleContactClick = (contact: Contact) => {
    if (connectedAccounts.length === 0) {
      toast({ title: "Nenhuma conta WhatsApp conectada", variant: "destructive" });
      return;
    }
    
    if (connectedAccounts.length === 1) {
      startConversation.mutate({
        phoneNumber: contact.phoneNumber,
        whatsappAccountId: connectedAccounts[0].id,
        name: contact.name,
      });
    } else {
      setContactToMessage(contact);
      setIsAccountSelectorOpen(true);
    }
  };

  const handleSendWithAccount = (accountId: string) => {
    if (!contactToMessage) return;
    startConversation.mutate({
      phoneNumber: contactToMessage.phoneNumber,
      whatsappAccountId: accountId,
      name: contactToMessage.name,
    });
  };

  const toggleContactSelection = (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map(c => c.id)));
    }
  };

  const handleDeleteSelected = () => {
    deleteContacts.mutate(Array.from(selectedContacts));
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold">Contatos</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Busque contatos ou inicie uma nova conversa
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!isOperator && selectedContacts.size > 0 && (
                <Button 
                  variant="destructive" 
                  onClick={() => setIsDeleteDialogOpen(true)}
                  data-testid="button-delete-contacts"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Apagar ({selectedContacts.size})
                </Button>
              )}
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-new-conversation">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Nova Conversa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Iniciar Nova Conversa</DialogTitle>
                    <DialogDescription>
                      Digite o número de telefone para iniciar uma conversa
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleStartConversation)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número de Telefone</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  placeholder="+5511959240517"
                                  className="pl-10"
                                  data-testid="input-phone-number"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome do Contato (opcional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="João Silva" data-testid="input-contact-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="whatsappAccountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Conta WhatsApp</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-whatsapp-account">
                                  <SelectValue placeholder="Selecione a conta" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {connectedAccounts.map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.name} ({account.phoneNumber})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {connectedAccounts.length === 0 && (
                              <p className="text-xs text-destructive">Nenhuma conta WhatsApp conectada</p>
                            )}
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
                          disabled={startConversation.isPending || connectedAccounts.length === 0}
                          data-testid="button-start-conversation"
                        >
                          Iniciar Conversa
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-6 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-contacts"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={attributeFilter} onValueChange={setAttributeFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-attribute-filter">
                  <SelectValue placeholder="Atributo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Atributos</SelectItem>
                  <SelectItem value="has_any">Com Atributo</SelectItem>
                  {contactAttributes.map((attr) => (
                    <SelectItem key={attr.id} value={attr.name}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: attr.color }} />
                        {attr.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={inactivityFilter} onValueChange={setInactivityFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-inactivity-filter">
                  <SelectValue placeholder="Inatividade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="0_1">Hoje/Ontem</SelectItem>
                  <SelectItem value="2_3">2-3 dias</SelectItem>
                  <SelectItem value="4_7">4-7 dias</SelectItem>
                  <SelectItem value="8_15">8-15 dias</SelectItem>
                  <SelectItem value="16_30">16-30 dias</SelectItem>
                  <SelectItem value="30_plus">+30 dias</SelectItem>
                  <SelectItem value="never_inbound">Nunca respondeu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <LoadingCard />
          ) : filteredContacts.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Users}
                  title={searchQuery || attributeFilter !== "all" || inactivityFilter !== "all" ? "Nenhum contato encontrado" : "Nenhum contato ainda"}
                  description={searchQuery || attributeFilter !== "all" || inactivityFilter !== "all" ? "Tente alterar os filtros" : "Inicie uma conversa para criar seu primeiro contato"}
                  action={
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Nova Conversa
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {!isOperator && filteredContacts.length > 0 && (
                  <div className="flex items-center gap-3 p-3 border-b">
                    <Checkbox
                      checked={selectedContacts.size === filteredContacts.length}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all-contacts"
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedContacts.size > 0 
                        ? `${selectedContacts.size} selecionados` 
                        : "Selecionar todos"}
                    </span>
                  </div>
                )}
                <div className="divide-y">
                  {filteredContacts.map((contact) => {
                    const lastInbound = (contact as { lastInboundAt?: string | null }).lastInboundAt;
                    const colorClass = contact.attributes && contact.attributes.length > 0 ? getInactivityColor(lastInbound) : null;
                    return (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 p-4 hover-elevate cursor-pointer"
                        onClick={() => handleContactClick(contact)}
                        data-testid={`contact-row-${contact.id}`}
                      >
                        {!isOperator && (
                          <Checkbox
                            checked={selectedContacts.has(contact.id)}
                            onCheckedChange={() => {}}
                            onClick={(e) => toggleContactSelection(contact.id, e)}
                            data-testid={`checkbox-contact-${contact.id}`}
                          />
                        )}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <AvatarWithFallback name={contact.name} src={contact.avatarUrl} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{contact.name}</span>
                              {contact.attributes && contact.attributes.slice(0, 2).map((attr, idx) => (
                                <AttributeChip key={`${contact.id}-attr-${idx}`} name={attr} size="xs" />
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-muted-foreground truncate">{formatPhoneNumber(contact.phoneNumber)}</p>
                              {colorClass && (
                                <span 
                                  className={cn(
                                    "text-[10px] shrink-0",
                                    colorClass === "ok" && "text-green-600 dark:text-green-400",
                                    colorClass === "attention" && "text-yellow-600 dark:text-yellow-400",
                                    colorClass === "critical" && "text-red-600 dark:text-red-400",
                                    colorClass === "never" && "text-muted-foreground"
                                  )}
                                  title="Tempo desde última mensagem do cliente"
                                >
                                  {formatTimeAgo(lastInbound)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isAccountSelectorOpen} onOpenChange={setIsAccountSelectorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolher Conta WhatsApp</DialogTitle>
            <DialogDescription>
              Selecione qual conta WhatsApp usar para enviar mensagem para{" "}
              <strong>{contactToMessage?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {connectedAccounts.map((account) => (
              <Button
                key={account.id}
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={() => handleSendWithAccount(account.id)}
                disabled={startConversation.isPending}
                data-testid={`button-select-account-${account.id}`}
              >
                <MessageSquare className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">{account.name}</div>
                  <div className="text-xs text-muted-foreground">{account.phoneNumber}</div>
                </div>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAccountSelectorOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Contatos</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja apagar {selectedContacts.size} contato(s)?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteSelected}
              disabled={deleteContacts.isPending}
              data-testid="button-confirm-delete-contacts"
            >
              {deleteContacts.isPending ? "Apagando..." : "Apagar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
