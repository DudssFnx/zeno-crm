import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, User, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardLayout } from "./dashboard";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Tag, Contact, ContactWithTags } from "@shared/schema";

interface KanbanContact extends Contact {
  tags: Tag[];
}

export default function KanbanPage() {
  const authFetch = useAuthFetch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: tags = [], isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await authFetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  const { data: contactTagsMap = {}, isLoading: tagsMapLoading } = useQuery({
    queryKey: ["/api/contact-tags-map"],
    queryFn: async () => {
      const map: Record<string, Tag[]> = {};
      for (const contact of contacts) {
        try {
          const res = await authFetch(`/api/contacts/${contact.id}`);
          if (res.ok) {
            const data: ContactWithTags = await res.json();
            map[contact.id] = data.tags || [];
          }
        } catch {
          map[contact.id] = [];
        }
      }
      return map;
    },
    enabled: contacts.length > 0,
  });

  const updateContactTag = useMutation({
    mutationFn: async ({ contactId, newTagId, oldTagId }: { contactId: string; newTagId: string; oldTagId?: string }) => {
      if (oldTagId) {
        await authFetch(`/api/contacts/${contactId}/tags/${oldTagId}`, { method: "DELETE" });
      }
      const res = await authFetch(`/api/contacts/${contactId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tagId: newTagId }),
      });
      if (!res.ok) throw new Error("Failed to update tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-tags-map"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contato movido" });
    },
    onError: () => {
      toast({ title: "Falha ao mover contato", variant: "destructive" });
    },
  });

  const isLoading = tagsLoading || contactsLoading;

  // Sort tags by stageOrder
  const sortedTags = [...tags].sort((a, b) => {
    const orderA = a.stageOrder ? parseInt(a.stageOrder) : 999;
    const orderB = b.stageOrder ? parseInt(b.stageOrder) : 999;
    return orderA - orderB;
  });

  // Filter only tags that have stageOrder (Kanban columns)
  const kanbanTags = sortedTags.filter(t => t.stageOrder);
  
  // Get contacts for each tag
  const getContactsForTag = (tagId: string): Contact[] => {
    return contacts.filter(contact => {
      const contactTags = contactTagsMap[contact.id] || [];
      return contactTags.some(t => t.id === tagId);
    });
  };

  // Get contacts without any kanban tags
  const untaggedContacts = contacts.filter(contact => {
    const contactTags = contactTagsMap[contact.id] || [];
    return !contactTags.some(t => t.stageOrder);
  });

  const handleContactClick = (contact: Contact) => {
    setLocation(`/?contact=${contact.id}`);
  };

  const handleDragStart = (e: React.DragEvent, contactId: string, currentTagId?: string) => {
    e.dataTransfer.setData("contactId", contactId);
    if (currentTagId) {
      e.dataTransfer.setData("currentTagId", currentTagId);
    }
  };

  const handleDrop = (e: React.DragEvent, newTagId: string) => {
    e.preventDefault();
    const contactId = e.dataTransfer.getData("contactId");
    const oldTagId = e.dataTransfer.getData("currentTagId");
    
    if (contactId && newTagId !== oldTagId) {
      updateContactTag.mutate({ contactId, newTagId, oldTagId: oldTagId || undefined });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Pipeline de Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Arraste os contatos entre os estágios para atualizar o status
          </p>
        </div>

        {isLoading ? (
          <LoadingCard />
        ) : kanbanTags.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={LayoutGrid}
                title="Nenhum estágio do pipeline"
                description="Crie etiquetas com números de ordem em Configurações > Etiquetas para configurar seu pipeline"
              />
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 h-[calc(100vh-180px)] overflow-x-auto pb-4">
            {kanbanTags.map((tag) => {
              const tagContacts = getContactsForTag(tag.id);
              return (
                <div
                  key={tag.id}
                  className="w-72 shrink-0 flex flex-col bg-muted/50 rounded-lg"
                  onDrop={(e) => handleDrop(e, tag.id)}
                  onDragOver={handleDragOver}
                >
                  <div className="p-3 border-b flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="font-medium text-sm">{tag.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {tagContacts.length}
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    <div className="space-y-2">
                      {tagContacts.map((contact) => (
                        <Card
                          key={contact.id}
                          className="cursor-grab active:cursor-grabbing hover-elevate"
                          draggable
                          onDragStart={(e) => handleDragStart(e, contact.id, tag.id)}
                          onClick={() => handleContactClick(contact)}
                          data-testid={`kanban-card-${contact.id}`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2">
                              <AvatarWithFallback name={contact.name} src={contact.avatarUrl} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">{contact.name}</p>
                                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {contact.phoneNumber}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {tagContacts.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          Nenhum contato
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
            
            {untaggedContacts.length > 0 && (
              <div className="w-72 shrink-0 flex flex-col bg-muted/30 rounded-lg opacity-60">
                <div className="p-3 border-b flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm text-muted-foreground">Não Atribuído</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {untaggedContacts.length}
                  </Badge>
                </div>
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {untaggedContacts.map((contact) => (
                      <Card
                        key={contact.id}
                        className="cursor-grab active:cursor-grabbing hover-elevate"
                        draggable
                        onDragStart={(e) => handleDragStart(e, contact.id)}
                        onClick={() => handleContactClick(contact)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2">
                            <AvatarWithFallback name={contact.name} src={contact.avatarUrl} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{contact.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{contact.phoneNumber}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
