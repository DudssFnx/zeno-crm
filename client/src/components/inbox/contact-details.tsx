import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Plus, Phone, MessageSquare, Tag as TagIcon, StickyNote, Globe, UserPlus, ArrowLeft, Pencil, Check, User, Star, Mail, MailOpen, MapPin } from "lucide-react";
import { SiWhatsapp, SiInstagram, SiGoogle } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { TagChip } from "@/components/tag-chip";
import { AttributeChip } from "@/components/attribute-chip";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ConversationWithDetails, ContactWithTags, Tag, ContactAttribute } from "@shared/schema";

interface ContactDetailsProps {
  conversationId: string;
  onClose: () => void;
  isMobile?: boolean;
}

export function ContactDetails({ conversationId, onClose, isMobile }: ContactDetailsProps) {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const isOperator = user?.role === "operator";
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [notesTimeout, setNotesTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [city, setCity] = useState("");
  const [cityTimeout, setCityTimeout] = useState<NodeJS.Timeout | null>(null);

  const { data: conversation } = useQuery<ConversationWithDetails>({
    queryKey: ["/api/conversations", conversationId],
    queryFn: async () => {
      const res = await authFetch(`/api/conversations/${conversationId}`);
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
  });

  const { data: contactWithTags, isLoading: contactLoading } = useQuery<ContactWithTags>({
    queryKey: ["/api/contacts", conversation?.contactId],
    queryFn: async () => {
      const res = await authFetch(`/api/contacts/${conversation?.contactId}`);
      if (!res.ok) throw new Error("Failed to fetch contact");
      return res.json();
    },
    enabled: !!conversation?.contactId,
  });

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  const { data: contactAttributes = [] } = useQuery<ContactAttribute[]>({
    queryKey: ["/api/contact-attributes"],
    queryFn: async () => {
      const res = await authFetch("/api/contact-attributes");
      if (!res.ok) throw new Error("Failed to fetch contact attributes");
      return res.json();
    },
    enabled: !!user,
  });

  const getAttributeInfo = (attributeName: string | null | undefined) => {
    if (!attributeName) return null;
    return contactAttributes.find(attr => attr.name === attributeName);
  };

  useEffect(() => {
    if (contactWithTags?.notes !== undefined) {
      setNotes(contactWithTags.notes || "");
    }
  }, [contactWithTags?.notes]);

  useEffect(() => {
    if (contactWithTags?.name) {
      setEditedName(contactWithTags.name);
    }
  }, [contactWithTags?.name]);

  useEffect(() => {
    if (contactWithTags?.city !== undefined) {
      setCity(contactWithTags.city || "");
    }
  }, [contactWithTags?.city]);

  const updateContact = useMutation({
    mutationFn: async (data: { name?: string; attributes?: string[] | null }) => {
      const res = await authFetch(`/api/contacts/${contactWithTags?.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update contact");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", conversation?.contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Contato atualizado" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao atualizar contato", variant: "destructive" });
    },
  });

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== contactWithTags?.name) {
      updateContact.mutate({ name: editedName.trim() });
    }
    setIsEditingName(false);
  };

  const handleAddAttribute = (attrName: string) => {
    if (attrName === "NONE" || !contactWithTags) return;
    const currentAttrs = contactWithTags.attributes || [];
    if (currentAttrs.length >= 3) {
      toast({ title: "Máximo de 3 atributos", description: "Remova um atributo para adicionar outro.", variant: "destructive" });
      return;
    }
    if (!currentAttrs.includes(attrName)) {
      updateContact.mutate({ attributes: [...currentAttrs, attrName] });
    }
  };

  const handleRemoveAttribute = async (attrName: string) => {
    if (!contactWithTags) return;
    const currentAttrs = contactWithTags.attributes || [];
    updateContact.mutate({ attributes: currentAttrs.filter(a => a !== attrName) });
    // Reset the attribute count when removing
    try {
      await authFetch(`/api/contacts/${contactWithTags.id}/attribute-counts/${encodeURIComponent(attrName)}`, {
        method: "DELETE",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactWithTags.id, "attribute-counts"] });
    } catch (e) {
      // Ignore errors - count reset is not critical
    }
  };

  const updateNotes = useMutation({
    mutationFn: async (newNotes: string) => {
      const res = await authFetch(`/api/contacts/${contactWithTags?.id}`, {
        method: "PUT",
        body: JSON.stringify({ notes: newNotes }),
      });
      if (!res.ok) throw new Error("Failed to update notes");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", conversation?.contactId] });
    },
  });

  const updateCity = useMutation({
    mutationFn: async (newCity: string) => {
      const res = await authFetch(`/api/contacts/${contactWithTags?.id}/city`, {
        method: "PUT",
        body: JSON.stringify({ city: newCity }),
      });
      if (!res.ok) throw new Error("Failed to update city");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", conversation?.contactId] });
      toast({ title: "Cidade atualizada" });
    },
  });

  const handleCityChange = (value: string) => {
    setCity(value);
    if (cityTimeout) {
      clearTimeout(cityTimeout);
    }
    const timeout = setTimeout(() => {
      updateCity.mutate(value);
    }, 1500);
    setCityTimeout(timeout);
  };

  const addTag = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await authFetch(`/api/contacts/${contactWithTags?.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) throw new Error("Failed to add tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", conversation?.contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await authFetch(`/api/contacts/${contactWithTags?.id}/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", conversation?.contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const toggleUnread = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/conversations/${conversationId}/toggle-unread`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to toggle unread");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ 
        title: conversation?.isUnread ? "Marcado como lido" : "Marcado como não lido"
      });
    },
  });

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (notesTimeout) {
      clearTimeout(notesTimeout);
    }
    const timeout = setTimeout(() => {
      updateNotes.mutate(value);
    }, 1000);
    setNotesTimeout(timeout);
  };

  const availableTags = allTags.filter(
    (tag) => !contactWithTags?.tags.some((ct) => ct.id === tag.id)
  );

  const getSourceInfo = (source: string | null) => {
    switch (source) {
      case "whatsapp":
        return { label: "WhatsApp", icon: SiWhatsapp, color: "text-green-500" };
      case "instagram":
        return { label: "Instagram", icon: SiInstagram, color: "text-pink-500" };
      case "site":
        return { label: "Site", icon: Globe, color: "text-blue-500" };
      case "google":
        return { label: "Google", icon: SiGoogle, color: "text-yellow-500" };
      case "manual":
        return { label: "Manual", icon: UserPlus, color: "text-muted-foreground" };
      default:
        return { label: "WhatsApp", icon: SiWhatsapp, color: "text-green-500" };
    }
  };

  if (contactLoading || !contactWithTags || !conversation) {
    return (
      <div className={cn(
        "border-l flex items-center justify-center bg-background",
        isMobile ? "w-full h-full" : "w-80"
      )}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={cn(
      "border-l flex flex-col bg-background h-full",
      isMobile ? "w-full" : "w-80"
    )}>
      <header className="h-14 border-b flex items-center justify-between gap-2 px-3 md:px-4 shrink-0">
        <div className="flex items-center gap-2">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="shrink-0 min-h-[44px] min-w-[44px]"
              data-testid="button-back-from-details"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h2 className="font-medium">Detalhes do Contato</h2>
        </div>
        {!isMobile && (
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-details">
            <X className="h-4 w-4" />
          </Button>
        )}
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6">
          <div className="flex flex-col items-center text-center mb-6">
            <AvatarWithFallback
              name={contactWithTags.name}
              src={contactWithTags.avatarUrl}
              size="xl"
              className="mb-4"
            />
            
            {!isOperator && isEditingName ? (
              <div className="flex items-center gap-2 mb-2">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-center text-lg font-medium"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  data-testid="input-edit-name"
                />
                <Button size="icon" variant="ghost" onClick={handleSaveName} data-testid="button-save-name">
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-medium">{contactWithTags.name}</h3>
                {!isOperator && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditingName(true)}
                    className="h-6 w-6"
                    data-testid="button-edit-name"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
            
            {contactWithTags.attributes && contactWithTags.attributes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2 justify-center">
                {contactWithTags.attributes.map((attr, idx) => (
                  <AttributeChip key={`${attr}-${idx}`} name={attr} contactId={contactWithTags.id} size="sm" />
                ))}
              </div>
            )}
            
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <Phone className="h-3 w-3" />
              {contactWithTags.phoneNumber}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MessageSquare className="h-3 w-3" />
              {conversation.whatsappAccount?.name || "WhatsApp"}
            </div>
            {(() => {
              const sourceInfo = getSourceInfo(contactWithTags.source);
              const SourceIcon = sourceInfo.icon;
              return (
                <div className={cn("flex items-center gap-1 text-xs mt-1", sourceInfo.color)} data-testid="text-contact-source">
                  <SourceIcon className="h-3 w-3" />
                  Origem: {sourceInfo.label}
                </div>
              );
            })()}
            
            <Button
              variant={conversation.isUnread ? "default" : "outline"}
              size="sm"
              onClick={() => toggleUnread.mutate()}
              disabled={toggleUnread.isPending}
              className="mt-4 gap-2"
              data-testid="button-toggle-unread"
            >
              {conversation.isUnread ? (
                <>
                  <MailOpen className="h-4 w-4" />
                  Marcar como Lido
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Marcar como Não Lido
                </>
              )}
            </Button>
          </div>

          <Separator className="mb-6" />

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Observações</h4>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Adicione observações sobre este contato..."
                className="min-h-[120px] resize-none"
                data-testid="textarea-contact-notes"
              />
              {updateNotes.isPending && (
                <p className="text-xs text-muted-foreground mt-1">Salvando...</p>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Cidade</h4>
              </div>
              <Input
                value={city}
                onChange={(e) => handleCityChange(e.target.value)}
                placeholder="Ex: São Paulo, SP"
                data-testid="input-contact-city"
              />
              {updateCity.isPending && (
                <p className="text-xs text-muted-foreground mt-1">Salvando...</p>
              )}
              {contactWithTags.latitude && contactWithTags.longitude && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Localização encontrada
                </p>
              )}
            </div>

            <Separator />

            {!isOperator && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-4 w-4 text-amber-500" />
                  <h4 className="text-sm font-medium">Atributos (máx. 3)</h4>
                </div>
                
                {contactWithTags.attributes && contactWithTags.attributes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {contactWithTags.attributes.map((attr, idx) => {
                      const attrInfo = getAttributeInfo(attr);
                      return (
                        <Badge 
                          key={`edit-${attr}-${idx}`}
                          variant="outline" 
                          className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400 pr-1"
                          style={attrInfo ? { borderColor: `${attrInfo.color}50` } : undefined}
                        >
                          <span 
                            className="w-2 h-2 rounded-full mr-1" 
                            style={{ backgroundColor: attrInfo?.color || "#6B7280" }}
                          />
                          {attr}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 ml-1 p-0"
                            onClick={() => handleRemoveAttribute(attr)}
                            data-testid={`button-remove-attribute-${idx}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                
                <Select 
                  value=""
                  onValueChange={handleAddAttribute}
                  disabled={(contactWithTags.attributes?.length || 0) >= 3}
                >
                  <SelectTrigger data-testid="select-attribute">
                    <SelectValue placeholder={
                      (contactWithTags.attributes?.length || 0) >= 3 
                        ? "Máximo de atributos atingido" 
                        : "Adicionar atributo"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {contactAttributes
                      .filter(attr => !(contactWithTags.attributes || []).includes(attr.name))
                      .map((attr) => (
                        <SelectItem key={attr.id} value={attr.name}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: attr.color }}
                            />
                            {attr.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {updateContact.isPending && (
                  <p className="text-xs text-muted-foreground mt-1">Salvando...</p>
                )}
              </div>
            )}

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <TagIcon className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Etiquetas</h4>
              </div>

              {contactWithTags.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {contactWithTags.tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      size="md"
                      onRemove={isOperator ? undefined : () => removeTag.mutate(tag.id)}
                    />
                  ))}
                </div>
              )}

              {!isOperator && availableTags.length > 0 && (
                <Select onValueChange={(tagId) => addTag.mutate(tagId)}>
                  <SelectTrigger data-testid="select-add-tag">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      <span>Adicionar etiqueta</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-3">Atividade</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Criado em: {new Date(contactWithTags.createdAt).toLocaleDateString("pt-BR")}</p>
                <p>Atualizado em: {new Date(contactWithTags.updatedAt).toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
