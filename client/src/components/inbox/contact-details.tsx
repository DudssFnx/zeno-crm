import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Plus, Phone, MessageSquare, Tag as TagIcon, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { TagChip } from "@/components/tag-chip";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ConversationWithDetails, ContactWithTags, Tag } from "@shared/schema";

interface ContactDetailsProps {
  conversationId: string;
  onClose: () => void;
}

export function ContactDetails({ conversationId, onClose }: ContactDetailsProps) {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [notesTimeout, setNotesTimeout] = useState<NodeJS.Timeout | null>(null);

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

  if (contactLoading || !contactWithTags || !conversation) {
    return (
      <div className="w-80 border-l flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="w-80 border-l flex flex-col bg-background">
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0">
        <h2 className="font-medium">Contact Details</h2>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-details">
          <X className="h-4 w-4" />
        </Button>
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
            <h3 className="text-lg font-medium">{contactWithTags.name}</h3>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <Phone className="h-3 w-3" />
              {contactWithTags.phoneNumber}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MessageSquare className="h-3 w-3" />
              {conversation.whatsappAccount?.name || "WhatsApp"}
            </div>
          </div>

          <Separator className="mb-6" />

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Notes</h4>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add notes about this contact..."
                className="min-h-[120px] resize-none"
                data-testid="textarea-contact-notes"
              />
              {updateNotes.isPending && (
                <p className="text-xs text-muted-foreground mt-1">Saving...</p>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <TagIcon className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Tags</h4>
              </div>

              {contactWithTags.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {contactWithTags.tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      size="md"
                      onRemove={() => removeTag.mutate(tag.id)}
                    />
                  ))}
                </div>
              )}

              {availableTags.length > 0 && (
                <Select onValueChange={(tagId) => addTag.mutate(tagId)}>
                  <SelectTrigger data-testid="select-add-tag">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      <span>Add tag</span>
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
              <h4 className="text-sm font-medium mb-3">Activity</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Created: {new Date(contactWithTags.createdAt).toLocaleDateString()}</p>
                <p>Last updated: {new Date(contactWithTags.updatedAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
