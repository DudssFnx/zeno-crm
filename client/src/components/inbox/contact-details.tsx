import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Plus, Phone, MessageSquare, Tag as TagIcon, StickyNote, Globe, UserPlus, ArrowLeft, Pencil, Check, User } from "lucide-react";
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
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ConversationWithDetails, ContactWithTags, Tag } from "@shared/schema";

const ATTRIBUTE_OPTIONS = [
  { value: "NONE", label: "Nenhum" },
  { value: "CLIENTE", label: "Cliente" },
  { value: "FORNECEDOR", label: "Fornecedor" },
  { value: "PARCEIRO", label: "Parceiro" },
  { value: "LEAD", label: "Lead" },
  { value: "VIP", label: "VIP" },
];

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

  const updateContact = useMutation({
    mutationFn: async (data: { name?: string; attribute?: string | null }) => {
      const res = await authFetch(`/api/contacts/${contactWithTags?.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", conversation?.contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Contato atualizado" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar contato", variant: "destructive" });
    },
  });

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== contactWithTags?.name) {
      updateContact.mutate({ name: editedName.trim() });
    }
    setIsEditingName(false);
  };

  const handleAttributeChange = (value: string) => {
    updateContact.mutate({ attribute: value === "NONE" ? null : value });
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
      "border-l flex flex-col bg-background",
      isMobile ? "w-full h-full" : "w-80"
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
            
            {contactWithTags.attribute && (
              <Badge variant="secondary" className="mb-2 bg-orange-500/20 text-orange-600 dark:text-orange-400" data-testid="badge-attribute">
                {contactWithTags.attribute}
              </Badge>
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

            {!isOperator && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium">Atributo</h4>
                </div>
                <Select 
                  value={contactWithTags.attribute || "NONE"} 
                  onValueChange={handleAttributeChange}
                >
                  <SelectTrigger data-testid="select-attribute">
                    <SelectValue placeholder="Selecione um atributo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTRIBUTE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
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
