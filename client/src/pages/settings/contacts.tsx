import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Phone, MessageSquare, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "../dashboard";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Contact, WhatsappAccount } from "@shared/schema";

const startConversationSchema = z.object({
  phoneNumber: z.string().min(10, "Enter a valid phone number"),
  whatsappAccountId: z.string().min(1, "Select a WhatsApp account"),
  name: z.string().optional(),
});

type StartConversationData = z.infer<typeof startConversationSchema>;

export default function ContactsPage() {
  const authFetch = useAuthFetch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
      form.reset();
      toast({ title: "Conversation started" });
      setLocation(`/?conversation=${data.conversation.id}`);
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const handleStartConversation = (data: StartConversationData) => {
    startConversation.mutate(data);
  };

  const handleContactClick = async (contact: Contact) => {
    if (connectedAccounts.length === 0) {
      toast({ title: "No WhatsApp account connected", variant: "destructive" });
      return;
    }
    
    startConversation.mutate({
      phoneNumber: contact.phoneNumber,
      whatsappAccountId: contact.whatsappAccountId || connectedAccounts[0].id,
      name: contact.name,
    });
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold">Contacts</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Search contacts or start a new conversation
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-conversation">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  New Conversation
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start New Conversation</DialogTitle>
                  <DialogDescription>
                    Enter the phone number to start a conversation
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleStartConversation)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
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
                          <FormLabel>Contact Name (optional)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="John Doe" data-testid="input-contact-name" />
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
                          <FormLabel>WhatsApp Account</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-whatsapp-account">
                                <SelectValue placeholder="Select account" />
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
                            <p className="text-xs text-destructive">No connected WhatsApp accounts</p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={startConversation.isPending || connectedAccounts.length === 0}
                        data-testid="button-start-conversation"
                      >
                        Start Conversation
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-contacts"
              />
            </div>
          </div>

          {isLoading ? (
            <LoadingCard />
          ) : contacts.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Users}
                  title={searchQuery ? "No contacts found" : "No contacts yet"}
                  description={searchQuery ? "Try a different search term" : "Start a conversation to create your first contact"}
                  action={
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      New Conversation
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between gap-4 p-4 hover-elevate cursor-pointer"
                      onClick={() => handleContactClick(contact)}
                      data-testid={`contact-row-${contact.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <AvatarWithFallback name={contact.name} src={contact.avatarUrl} size="md" />
                        <div>
                          <span className="font-medium">{contact.name}</span>
                          <p className="text-sm text-muted-foreground">{contact.phoneNumber}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
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
