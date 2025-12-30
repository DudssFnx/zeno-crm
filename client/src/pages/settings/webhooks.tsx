import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Webhook, Globe, Key, CheckCircle2, XCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { WebhookConfig } from "@shared/schema";

const webhookEvents = [
  { id: "message.incoming", label: "Incoming Message", description: "When a new message is received" },
  { id: "contact.tag.changed", label: "Tag Changed", description: "When a contact's tags are modified" },
  { id: "conversation.status.changed", label: "Status Changed", description: "When a conversation status changes" },
];

const webhookFormSchema = z.object({
  url: z.string().url("Enter a valid URL"),
  secret: z.string().optional(),
  events: z.array(z.string()).min(1, "Select at least one event"),
  isActive: z.boolean(),
});

type WebhookFormData = z.infer<typeof webhookFormSchema>;

export default function WebhooksPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);

  const form = useForm<WebhookFormData>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: { url: "", secret: "", events: [], isActive: true },
  });

  const { data: webhooks = [], isLoading } = useQuery<WebhookConfig[]>({
    queryKey: ["/api/webhooks"],
    queryFn: async () => {
      const res = await authFetch("/api/webhooks");
      if (!res.ok) throw new Error("Failed to fetch webhooks");
      return res.json();
    },
  });

  const createWebhook = useMutation({
    mutationFn: async (data: WebhookFormData) => {
      const res = await authFetch("/api/webhooks", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create webhook");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Webhook created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async (data: WebhookFormData & { id: string }) => {
      const res = await authFetch(`/api/webhooks/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
          url: data.url,
          secret: data.secret,
          events: data.events,
          isActive: data.isActive,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update webhook");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      setIsDialogOpen(false);
      setEditingWebhook(null);
      form.reset();
      toast({ title: "Webhook updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/webhooks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete webhook");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({ title: "Webhook deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete webhook", variant: "destructive" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await authFetch(`/api/webhooks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update webhook");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
    },
  });

  const handleOpenDialog = (webhook?: WebhookConfig) => {
    if (webhook) {
      setEditingWebhook(webhook);
      form.reset({
        url: webhook.url,
        secret: webhook.secret || "",
        events: webhook.events as string[],
        isActive: webhook.isActive,
      });
    } else {
      setEditingWebhook(null);
      form.reset({ url: "", secret: "", events: [], isActive: true });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: WebhookFormData) => {
    if (editingWebhook) {
      updateWebhook.mutate({ ...data, id: editingWebhook.id });
    } else {
      createWebhook.mutate(data);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Webhooks</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Receive real-time notifications for events
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-webhook">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingWebhook ? "Edit Webhook" : "Create Webhook"}</DialogTitle>
                  <DialogDescription>
                    {editingWebhook
                      ? "Update webhook configuration."
                      : "Set up a webhook to receive event notifications."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endpoint URL</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder="https://your-server.com/webhook"
                                className="pl-10"
                                data-testid="input-webhook-url"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="secret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Secret (optional)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                {...field}
                                type="password"
                                placeholder="HMAC signing secret"
                                className="pl-10"
                                data-testid="input-webhook-secret"
                              />
                            </div>
                          </FormControl>
                          <FormDescription>
                            Used to sign webhook payloads with HMAC-SHA256
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="events"
                      render={() => (
                        <FormItem>
                          <FormLabel>Events</FormLabel>
                          <div className="space-y-3 pt-2">
                            {webhookEvents.map((event) => (
                              <FormField
                                key={event.id}
                                control={form.control}
                                name="events"
                                render={({ field }) => (
                                  <FormItem className="flex items-start gap-3">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(event.id)}
                                        onCheckedChange={(checked) => {
                                          const newValue = checked
                                            ? [...(field.value || []), event.id]
                                            : field.value?.filter((v) => v !== event.id) || [];
                                          field.onChange(newValue);
                                        }}
                                        data-testid={`checkbox-event-${event.id}`}
                                      />
                                    </FormControl>
                                    <div className="space-y-0.5">
                                      <FormLabel className="font-normal cursor-pointer">
                                        {event.label}
                                      </FormLabel>
                                      <FormDescription className="text-xs">
                                        {event.description}
                                      </FormDescription>
                                    </div>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                              Enable or disable this webhook
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-webhook-active"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createWebhook.isPending || updateWebhook.isPending}
                        data-testid="button-save-webhook"
                      >
                        {(createWebhook.isPending || updateWebhook.isPending) ? (
                          <LoadingSpinner size="sm" className="text-primary-foreground" />
                        ) : editingWebhook ? (
                          "Save Changes"
                        ) : (
                          "Create Webhook"
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
          ) : webhooks.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Webhook}
                  title="No webhooks configured"
                  description="Set up webhooks to receive real-time event notifications"
                  action={
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Webhook
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <Card key={webhook.id} data-testid={`webhook-card-${webhook.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-mono text-sm truncate">{webhook.url}</span>
                          {webhook.isActive ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(webhook.events as string[]).map((event) => (
                            <Badge key={event} variant="outline" className="text-xs">
                              {webhookEvents.find((e) => e.id === event)?.label || event}
                            </Badge>
                          ))}
                        </div>
                        {webhook.secret && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <Key className="h-3 w-3" />
                            HMAC signing enabled
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={webhook.isActive}
                          onCheckedChange={(isActive) =>
                            toggleActive.mutate({ id: webhook.id, isActive })
                          }
                          data-testid={`switch-toggle-${webhook.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(webhook)}
                          data-testid={`button-edit-webhook-${webhook.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-delete-webhook-${webhook.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this webhook? You will no longer receive notifications.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteWebhook.mutate(webhook.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
