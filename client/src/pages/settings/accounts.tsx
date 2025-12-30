import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Smartphone, QrCode, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DashboardLayout } from "../dashboard";
import { StatusBadge } from "@/components/status-badge";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { WhatsappAccount } from "@shared/schema";

const accountFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phoneNumber: z.string().min(10, "Enter a valid phone number"),
});

type AccountFormData = z.infer<typeof accountFormSchema>;

export default function AccountsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<WhatsappAccount | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrAccountId, setQrAccountId] = useState<string | null>(null);

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { name: "", phoneNumber: "" },
  });

  const { data: accounts = [], isLoading } = useQuery<WhatsappAccount[]>({
    queryKey: ["/api/whatsapp-accounts"],
    queryFn: async () => {
      const res = await authFetch("/api/whatsapp-accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
  });

  const createAccount = useMutation({
    mutationFn: async (data: AccountFormData) => {
      const res = await authFetch("/api/whatsapp-accounts", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Account created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateAccount = useMutation({
    mutationFn: async (data: AccountFormData & { id: string }) => {
      const res = await authFetch(`/api/whatsapp-accounts/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: data.name, phoneNumber: data.phoneNumber }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
      setIsDialogOpen(false);
      setEditingAccount(null);
      form.reset();
      toast({ title: "Account updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/whatsapp-accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete account");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
      toast({ title: "Account deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete account", variant: "destructive" });
    },
  });

  const startSession = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/whatsapp-accounts/${id}/start-session`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start session");
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
      fetchQr(id);
    },
    onError: () => {
      toast({ title: "Failed to start session", variant: "destructive" });
    },
  });

  const fetchQr = async (id: string) => {
    try {
      const res = await authFetch(`/api/whatsapp-accounts/${id}/qr`);
      if (!res.ok) throw new Error("Failed to fetch QR");
      const data = await res.json();
      setQrData(data.qrData);
      setQrAccountId(id);
      setQrDialogOpen(true);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
      }, 3000);
    } catch {
      toast({ title: "Failed to fetch QR code", variant: "destructive" });
    }
  };

  const handleQrDialogClose = (open: boolean) => {
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
    }
    setQrDialogOpen(open);
  };

  const disconnectSession = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/whatsapp-accounts/${id}/disconnect`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
      toast({ title: "Session disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect session", variant: "destructive" });
    },
  });

  const handleOpenDialog = (account?: WhatsappAccount) => {
    if (account) {
      setEditingAccount(account);
      form.reset({ name: account.name, phoneNumber: account.phoneNumber });
    } else {
      setEditingAccount(null);
      form.reset({ name: "", phoneNumber: "" });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: AccountFormData) => {
    if (editingAccount) {
      updateAccount.mutate({ ...data, id: editingAccount.id });
    } else {
      createAccount.mutate(data);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">WhatsApp Accounts</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your WhatsApp connections
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-account">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingAccount ? "Edit Account" : "Add WhatsApp Account"}</DialogTitle>
                  <DialogDescription>
                    {editingAccount
                      ? "Update account information."
                      : "Add a new WhatsApp account to manage."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Sales Team" data-testid="input-account-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="+55 11 99999-9999" data-testid="input-account-phone" />
                          </FormControl>
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
                        disabled={createAccount.isPending || updateAccount.isPending}
                        data-testid="button-save-account"
                      >
                        {(createAccount.isPending || updateAccount.isPending) ? (
                          <LoadingSpinner size="sm" className="text-primary-foreground" />
                        ) : editingAccount ? (
                          "Save Changes"
                        ) : (
                          "Add Account"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Dialog open={qrDialogOpen} onOpenChange={handleQrDialogClose}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Scan QR Code</DialogTitle>
                <DialogDescription>
                  Open WhatsApp on your phone and scan this QR code to connect.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center py-6">
                {qrData ? (
                  <div className="p-4 bg-white rounded-lg">
                    <div className="w-64 h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                      <div className="text-center text-sm text-muted-foreground p-4">
                        <QrCode className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <p>Mock QR Code</p>
                        <p className="text-xs mt-2 font-mono break-all">{qrData.substring(0, 50)}...</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <LoadingSpinner size="lg" />
                )}
              </div>
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => qrAccountId && fetchQr(qrAccountId)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh QR
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {isLoading ? (
            <LoadingCard />
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Smartphone}
                  title="No WhatsApp accounts"
                  description="Add your first WhatsApp account to start receiving messages"
                  action={
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Account
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {accounts.map((account) => (
                <Card key={account.id} data-testid={`account-card-${account.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                          <Smartphone className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{account.name}</span>
                            <StatusBadge status={account.status as "connected" | "disconnected" | "pending_qr" | "error"} />
                          </div>
                          <p className="text-sm text-muted-foreground">{account.phoneNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.status === "connected" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => disconnectSession.mutate(account.id)}
                            disabled={disconnectSession.isPending}
                            data-testid={`button-disconnect-${account.id}`}
                          >
                            <WifiOff className="h-4 w-4 mr-2" />
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startSession.mutate(account.id)}
                            disabled={startSession.isPending}
                            data-testid={`button-connect-${account.id}`}
                          >
                            <Wifi className="h-4 w-4 mr-2" />
                            Connect
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(account)}
                          data-testid={`button-edit-account-${account.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-delete-account-${account.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Account</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{account.name}"? This will remove all associated conversations and messages.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteAccount.mutate(account.id)}
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
