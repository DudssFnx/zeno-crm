import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { Plus, Pencil, Trash2, Smartphone, QrCode, Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
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
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  phoneNumber: z.string().min(10, "Digite um número de telefone válido"),
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
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [timeLeft, setTimeLeft] = useState(120);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (qrData && timeLeft > 0 && connectionStatus === "pending_qr") {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      if (qrAccountId) fetchQr(qrAccountId);
      setTimeLeft(120);
    }
    return () => clearInterval(timer);
  }, [qrData, timeLeft, qrAccountId, connectionStatus]);
  const [isPolling, setIsPolling] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    socketRef.current = io(window.location.origin, {
      transports: ["websocket", "polling"],
      auth: { token },
    });

    socketRef.current.on("connect", () => {
      console.log("Socket connected");
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!qrAccountId || !socketRef.current) return;

    socketRef.current.emit("whatsapp:join", qrAccountId);

    const handleQr = (data: { qrCode: string }) => {
      console.log("QR received via socket");
      setQrData(data.qrCode);
      setConnectionStatus("pending_qr");
    };

    const handleStatus = (data: { status: string; error?: string }) => {
      console.log("Status received via socket:", data.status);
      setConnectionStatus(data.status);
      if (data.status === "connected") {
        setQrDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
        toast({ title: "WhatsApp conectado com sucesso!" });
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setIsPolling(false);
      }
      if (data.error) {
        toast({ title: data.error, variant: "destructive" });
      }
    };

    socketRef.current.on(`whatsapp:qr:${qrAccountId}`, handleQr);
    socketRef.current.on(`whatsapp:status:${qrAccountId}`, handleStatus);

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("whatsapp:leave", qrAccountId);
        socketRef.current.off(`whatsapp:qr:${qrAccountId}`, handleQr);
        socketRef.current.off(`whatsapp:status:${qrAccountId}`, handleStatus);
      }
    };
  }, [qrAccountId, toast]);

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
      toast({ title: "Conta criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao criar conta", variant: "destructive" });
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
      toast({ title: "Conta atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao atualizar conta", variant: "destructive" });
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
      toast({ title: "Conta excluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Falha ao excluir conta", variant: "destructive" });
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
      setIsPolling(true);
      const res = await authFetch(`/api/whatsapp-accounts/${id}/qr`);
      if (!res.ok) throw new Error("Failed to fetch QR");
      const data = await res.json();
      
      if (data.status === "connected") {
        setConnectionStatus("connected");
        setQrDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
        toast({ title: "WhatsApp conectado!" });
        setIsPolling(false);
        return;
      }
      
      if (data.qrData) {
        setQrData(data.qrData);
        setConnectionStatus(data.status || "pending_qr");
      } else {
        setConnectionStatus(data.status || "connecting");
      }
      
      setQrAccountId(id);
      setQrDialogOpen(true);
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await authFetch(`/api/whatsapp-accounts/${id}/qr`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.status === "connected") {
              setConnectionStatus("connected");
              setQrDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
              toast({ title: "WhatsApp conectado!" });
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
              }
              setIsPolling(false);
            } else if (pollData.qrData && pollData.qrData !== qrData) {
              setQrData(pollData.qrData);
              setConnectionStatus(pollData.status || "pending_qr");
            }
          }
        } catch (error) {
          console.error("Poll error:", error);
        }
      }, 3000);
      
    } catch {
      toast({ title: "Falha ao obter código QR", variant: "destructive" });
      setIsPolling(false);
    }
  };

  const handleQrDialogClose = (open: boolean) => {
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-accounts"] });
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (qrAccountId && socketRef.current) {
        socketRef.current.emit("whatsapp:leave", qrAccountId);
      }
      setIsPolling(false);
      setQrData(null);
      setConnectionStatus("disconnected");
      setQrAccountId(null);
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
      toast({ title: "Sessão desconectada" });
    },
    onError: () => {
      toast({ title: "Falha ao desconectar sessão", variant: "destructive" });
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
              <h1 className="text-2xl font-semibold">Contas WhatsApp</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Gerencie suas conexões do WhatsApp
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-account">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Conta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta WhatsApp"}</DialogTitle>
                  <DialogDescription>
                    {editingAccount
                      ? "Atualize as informações da conta."
                      : "Adicione uma nova conta WhatsApp para gerenciar."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome da Conta</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Equipe de Vendas" data-testid="input-account-name" />
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
                          <FormLabel>Número de Telefone</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="+55 11 99999-9999" data-testid="input-account-phone" />
                          </FormControl>
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
                        disabled={createAccount.isPending || updateAccount.isPending}
                        data-testid="button-save-account"
                      >
                        {(createAccount.isPending || updateAccount.isPending) ? (
                          <LoadingSpinner size="sm" className="text-primary-foreground" />
                        ) : editingAccount ? (
                          "Salvar Alterações"
                        ) : (
                          "Adicionar Conta"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Dialog open={qrDialogOpen} onOpenChange={handleQrDialogClose}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Conectar WhatsApp</DialogTitle>
                <DialogDescription>
                  Abra o WhatsApp no seu celular e escaneie este código QR para conectar.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center py-6">
                {connectionStatus === "connecting" && !qrData ? (
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                    <p className="text-sm text-muted-foreground">Iniciando WhatsApp Web...</p>
                    <p className="text-xs text-muted-foreground mt-1">Isso pode levar um momento</p>
                  </div>
                ) : qrData ? (
                  <div className="p-4 bg-white rounded-lg shadow-sm">
                    {qrData.startsWith("data:image") ? (
                      <img 
                        src={qrData} 
                        alt="WhatsApp QR Code" 
                        className="w-64 h-64 object-contain"
                        data-testid="img-qr-code"
                      />
                    ) : (
                      <div className="w-64 h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                        <div className="text-center text-sm text-muted-foreground p-4">
                          <QrCode className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                          <p>Carregando código QR...</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <LoadingSpinner size="lg" />
                    <p className="text-sm text-muted-foreground mt-4">Aguardando código QR...</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  Status: {connectionStatus === "pending_qr" ? `Aguardando leitura (${timeLeft}s)` : connectionStatus === "connected" ? "Conectado" : connectionStatus === "connecting" ? "Conectando" : connectionStatus}
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => qrAccountId && fetchQr(qrAccountId)}
                  disabled={isPolling && connectionStatus === "connecting"}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar QR
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
                  title="Nenhuma conta WhatsApp"
                  description="Adicione sua primeira conta WhatsApp para começar a receber mensagens"
                  action={
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Conta
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
                            Desconectar
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
                            Conectar
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
                              <AlertDialogTitle>Excluir Conta</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir "{account.name}"? Isso removerá todas as conversas e mensagens associadas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteAccount.mutate(account.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Excluir
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
