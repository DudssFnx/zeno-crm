import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { io, Socket } from "socket.io-client";
import { 
  Bot, 
  Clock, 
  Pause, 
  Play, 
  Trash2, 
  XCircle, 
  CheckCircle, 
  AlertCircle,
  Timer,
  Users,
  Activity,
  Shield,
  RefreshCw,
  ArrowLeft
} from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface QueueSettings {
  id: string;
  companyId: string;
  delayBetweenContacts: number;
  isQueueActive: boolean;
  maxConcurrentSessions: number;
}

interface QueueItem {
  id: string;
  companyId: string;
  robotId: string;
  conversationId: string;
  contactId: string;
  requestedBy: string | null;
  status: string;
  priority: number;
  position: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface QueueStatus {
  isProcessing: boolean;
  currentItem: QueueItem | null;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  delayBetweenContacts: number;
  nextProcessAt: string | null;
}

export default function RobotQueuePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentProgress, setCurrentProgress] = useState<{
    itemId: string;
    currentStep: number;
    totalSteps: number;
    currentActionLabel: string;
  } | null>(null);

  const { data: settings, isLoading: loadingSettings } = useQuery<QueueSettings>({
    queryKey: ["/api/robot-queue/settings"],
  });

  const { data: status, isLoading: loadingStatus } = useQuery<QueueStatus>({
    queryKey: ["/api/robot-queue/status"],
    refetchInterval: 5000,
  });

  const { data: pendingItems, isLoading: loadingPending } = useQuery<QueueItem[]>({
    queryKey: ["/api/robot-queue/items", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/robot-queue/items?status=pending", {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: history, isLoading: loadingHistory } = useQuery<QueueItem[]>({
    queryKey: ["/api/robot-queue/history"],
  });

  const { data: robots } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/robots"],
  });

  const { data: contacts } = useQuery<{ id: string; name: string; phoneNumber: string }[]>({
    queryKey: ["/api/contacts"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<QueueSettings>) => {
      const response = await apiRequest("PUT", "/api/robot-queue/settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/settings"] });
      toast({ title: "Configuracoes atualizadas" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar configuracoes", variant: "destructive" });
    },
  });

  const cancelItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("POST", `/api/robot-queue/cancel/${itemId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/status"] });
      toast({ title: "Item cancelado" });
    },
  });

  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/robot-queue/clear");
      return response.json();
    },
    onSuccess: (data: { cancelledCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/status"] });
      toast({ title: `${data.cancelledCount} itens cancelados` });
    },
  });

  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !user) return;

    socketRef.current = io(window.location.origin, {
      transports: ["websocket", "polling"],
      auth: { token },
      reconnection: true,
    });

    const socket = socketRef.current;

    const handleQueueUpdate = (data: any) => {
      console.log("[Queue] Update:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/robot-queue/history"] });

      if (data.type === "item_progress") {
        setCurrentProgress({
          itemId: data.itemId,
          currentStep: data.progress.currentStep,
          totalSteps: data.progress.totalSteps,
          currentActionLabel: data.progress.currentActionLabel,
        });
      }

      if (data.type === "waiting_delay") {
        setCountdown(data.delaySeconds);
      }

      if (data.type === "item_completed" || data.type === "item_failed") {
        setCurrentProgress(null);
      }
    };

    socket.on("queue:update", handleQueueUpdate);
    
    return () => {
      socket.off("queue:update", handleQueueUpdate);
      socket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const getRobotName = (robotId: string) => {
    return robots?.find((r) => r.id === robotId)?.name || "Robo desconhecido";
  };

  const getContactInfo = (contactId: string) => {
    const contact = contacts?.find((c) => c.id === contactId);
    return contact ? `${contact.name} (${contact.phoneNumber})` : "Contato desconhecido";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Aguardando</Badge>;
      case "processing":
        return <Badge className="bg-blue-500"><Activity className="w-3 h-3 mr-1" />Processando</Badge>;
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Concluido</Badge>;
      case "failed":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Falhou</Badge>;
      case "cancelled":
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loadingSettings || loadingStatus) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate("/settings/robots")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Shield className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Fila de Envio Anti-Spam</h1>
          <p className="text-muted-foreground">
            Gerenciamento seguro de envios para evitar bloqueios no WhatsApp
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Na Fila
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <span className="text-2xl font-bold">{status?.pendingCount || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Enviados Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-2xl font-bold">{status?.completedCount || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Falhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-2xl font-bold">{status?.failedCount || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Configuracoes Anti-Spam
            </CardTitle>
            <CardDescription>
              Ajuste o tempo entre envios para parecer mais humano
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Fila Ativa</Label>
                <p className="text-xs text-muted-foreground">
                  Habilitar/desabilitar processamento da fila
                </p>
              </div>
              <Switch
                checked={settings?.isQueueActive || false}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ isQueueActive: checked })}
                data-testid="switch-queue-active"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Delay entre Contatos</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Tempo de espera apos cada envio (segundos)
              </p>
              <Select
                value={String(settings?.delayBetweenContacts || 30)}
                onValueChange={(value) => updateSettingsMutation.mutate({ delayBetweenContacts: parseInt(value) })}
              >
                <SelectTrigger data-testid="select-delay">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 segundos (rapido)</SelectItem>
                  <SelectItem value="30">30 segundos (padrao)</SelectItem>
                  <SelectItem value="45">45 segundos (seguro)</SelectItem>
                  <SelectItem value="60">60 segundos (muito seguro)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Shield className="w-4 h-4 text-green-500" />
                Protecoes Ativas
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Envio sequencial (1 por vez)
                </li>
                <li className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Delay humanizado entre mensagens
                </li>
                <li className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Bloqueio de sessoes simultaneas
                </li>
                <li className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Simulacao de digitando/gravando
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Status em Tempo Real
            </CardTitle>
            <CardDescription>
              Acompanhe o processamento da fila ao vivo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status?.isProcessing && status.currentItem ? (
              <div className="p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
                  <span className="font-medium">Enviando agora</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p><strong>Robo:</strong> {getRobotName(status.currentItem.robotId)}</p>
                  <p><strong>Contato:</strong> {getContactInfo(status.currentItem.contactId)}</p>
                </div>
                {currentProgress && currentProgress.itemId === status.currentItem.id && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{currentProgress.currentActionLabel}</span>
                      <span>{currentProgress.currentStep}/{currentProgress.totalSteps}</span>
                    </div>
                    <Progress 
                      value={(currentProgress.currentStep / currentProgress.totalSteps) * 100} 
                    />
                  </div>
                )}
              </div>
            ) : countdown !== null && countdown > 0 ? (
              <div className="p-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">Aguardando delay anti-spam</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold text-amber-600">{countdown}s</div>
                  <span className="text-sm text-muted-foreground">ate o proximo envio</span>
                </div>
                <Progress value={((settings?.delayBetweenContacts || 30) - countdown) / (settings?.delayBetweenContacts || 30) * 100} />
              </div>
            ) : (
              <div className="p-4 rounded-lg border bg-muted/50 space-y-2">
                <div className="flex items-center gap-2">
                  {settings?.isQueueActive ? (
                    <>
                      <Play className="w-4 h-4 text-green-500" />
                      <span className="font-medium">Fila pronta</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 text-amber-500" />
                      <span className="font-medium">Fila pausada</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {status?.pendingCount === 0 
                    ? "Nenhum item na fila de envio"
                    : `${status?.pendingCount} itens aguardando processamento`
                  }
                </p>
              </div>
            )}

            {(pendingItems?.length || 0) > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearQueueMutation.mutate()}
                  disabled={clearQueueMutation.isPending}
                  data-testid="button-clear-queue"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar Fila
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Fila de Envio
          </CardTitle>
          <CardDescription>
            Proximos envios em ordem de prioridade
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPending ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
          ) : (pendingItems?.length || 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum item na fila
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {pendingItems?.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    data-testid={`queue-item-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{getRobotName(item.robotId)}</p>
                        <p className="text-xs text-muted-foreground">
                          {getContactInfo(item.contactId)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(item.status)}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => cancelItemMutation.mutate(item.id)}
                        disabled={cancelItemMutation.isPending}
                        data-testid={`button-cancel-${item.id}`}
                      >
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Historico de Envios
          </CardTitle>
          <CardDescription>
            Ultimos 50 envios realizados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
          ) : (history?.length || 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum envio realizado ainda
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {history?.filter(item => item.status !== "pending").map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                    data-testid={`history-item-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Bot className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{getRobotName(item.robotId)}</p>
                        <p className="text-xs text-muted-foreground">
                          {getContactInfo(item.contactId)}
                        </p>
                        {item.error && (
                          <p className="text-xs text-red-500 mt-1">{item.error}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(item.status)}
                      <span className="text-xs text-muted-foreground">
                        {item.completedAt 
                          ? formatDistanceToNow(new Date(item.completedAt), { addSuffix: true, locale: ptBR })
                          : "-"
                        }
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
