import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Upload, FileJson, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DashboardLayout } from "../dashboard";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface BackupData {
  version: string;
  exportedAt: string;
  companyName: string;
  data: {
    tags: unknown[];
    macros: unknown[];
    contactAttributes: unknown[];
    cannedResponses: unknown[];
    stages: unknown[];
    webhookConfigs: unknown[];
    triageMenus: unknown[];
    robots: unknown[];
    departments: unknown[];
    automationRules: unknown[];
  };
}

export default function BackupPage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "master";

  const exportBackup = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/backup/export");
      if (!res.ok) throw new Error("Falha ao exportar backup");
      return res.json();
    },
    onSuccess: (data: BackupData) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${data.companyName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Backup exportado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Falha ao exportar backup", variant: "destructive" });
    },
  });

  const importBackup = useMutation({
    mutationFn: async ({ data, options }: { data: BackupData["data"]; options: { clearExisting: boolean } }) => {
      const res = await authFetch("/api/backup/import", {
        method: "POST",
        body: JSON.stringify({ data, options }),
      });
      if (!res.ok) throw new Error("Falha ao importar backup");
      return res.json();
    },
    onSuccess: (result) => {
      setPendingBackup(null);
      setShowConfirmDialog(false);
      const items = Object.entries(result.imported || {})
        .filter(([, count]) => (count as number) > 0)
        .map(([key, count]) => `${key}: ${count}`)
        .join(", ");
      toast({ 
        title: "Backup importado com sucesso!", 
        description: items || "Nenhum item importado",
      });
    },
    onError: () => {
      toast({ title: "Falha ao importar backup", variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as BackupData;
        if (!data.version || !data.data) {
          throw new Error("Arquivo de backup invalido");
        }
        setPendingBackup(data);
        setShowConfirmDialog(true);
      } catch {
        toast({ title: "Arquivo de backup invalido", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = () => {
    if (!pendingBackup) return;
    importBackup.mutate({ data: pendingBackup.data, options: { clearExisting } });
  };

  const getItemCount = (backup: BackupData) => {
    const data = backup.data;
    return {
      tags: data.tags?.length || 0,
      macros: data.macros?.length || 0,
      contactAttributes: data.contactAttributes?.length || 0,
      cannedResponses: data.cannedResponses?.length || 0,
      stages: data.stages?.length || 0,
      webhookConfigs: data.webhookConfigs?.length || 0,
      triageMenus: data.triageMenus?.length || 0,
      robots: data.robots?.length || 0,
      departments: data.departments?.length || 0,
      automationRules: data.automationRules?.length || 0,
    };
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-muted-foreground">
                <AlertTriangle className="h-5 w-5" />
                <p>Apenas administradores podem acessar o backup.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Backup e Restauracao</h1>
          <p className="text-muted-foreground">
            Exporte e importe configuracoes do sistema
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Exportar Backup
              </CardTitle>
              <CardDescription>
                Baixe um arquivo com todas as configuracoes do sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>O backup inclui:</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>Tags e Etiquetas</li>
                  <li>Macros (Atalhos)</li>
                  <li>Atributos de Contato</li>
                  <li>Respostas Rapidas</li>
                  <li>Estagios do Kanban</li>
                  <li>Webhooks</li>
                  <li>Menus de Triagem</li>
                  <li>Robos de Automacao</li>
                  <li>Departamentos</li>
                  <li>Regras de Automacao</li>
                </ul>
              </div>
              <Button 
                onClick={() => exportBackup.mutate()} 
                disabled={exportBackup.isPending}
                className="w-full"
                data-testid="button-export-backup"
              >
                {exportBackup.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Gerar Arquivo de Backup
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Importar Backup
              </CardTitle>
              <CardDescription>
                Restaure configuracoes a partir de um arquivo de backup
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Instrucoes:</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>Selecione um arquivo .json de backup</li>
                  <li>Revise os itens antes de confirmar</li>
                  <li>Os IDs serao gerados novamente</li>
                  <li>Arquivos de audio precisam ser reenviados</li>
                </ul>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".json"
                className="hidden"
                data-testid="input-file-backup"
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full"
                data-testid="button-import-backup"
              >
                <FileJson className="h-4 w-4 mr-2" />
                Selecionar Arquivo de Backup
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Importante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Sobre IDs:</strong> As referencias de IDs em macros e robos 
                (como tagId nas acoes) sao mantidas como estao no backup. Se voce 
                estiver restaurando em um novo ambiente, pode precisar reconfigurar 
                essas associacoes manualmente.
              </p>
              <p>
                <strong>Arquivos de Audio:</strong> Os robos que usam audio precisam 
                ter os arquivos reenviados apos a restauracao, pois a pasta de uploads 
                nao e compartilhada entre ambientes.
              </p>
              <p>
                <strong>WhatsApp:</strong> Os menus de triagem serao associados a 
                primeira conta WhatsApp disponivel. Ajuste manualmente se necessario.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Importacao de Backup</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {pendingBackup && (
                <>
                  <div className="flex items-center gap-2 text-foreground">
                    <FileJson className="h-5 w-5" />
                    <span className="font-medium">{pendingBackup.companyName}</span>
                    <span className="text-muted-foreground text-xs">
                      ({new Date(pendingBackup.exportedAt).toLocaleDateString("pt-BR")})
                    </span>
                  </div>
                  <div className="bg-muted p-3 rounded-md text-sm">
                    <p className="font-medium mb-2">Itens no backup:</p>
                    <ul className="grid grid-cols-2 gap-1">
                      {Object.entries(getItemCount(pendingBackup)).map(([key, count]) => (
                        count > 0 && (
                          <li key={key} className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}: {count}</span>
                          </li>
                        )
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch
                      id="clear-existing"
                      checked={clearExisting}
                      onCheckedChange={setClearExisting}
                      data-testid="switch-clear-existing"
                    />
                    <Label htmlFor="clear-existing" className="text-sm">
                      Limpar dados existentes antes de importar
                    </Label>
                  </div>
                  {clearExisting && (
                    <div className="flex items-center gap-2 text-amber-600 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Isso vai remover todos os dados existentes!</span>
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-import">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmImport}
              disabled={importBackup.isPending}
              data-testid="button-confirm-import"
            >
              {importBackup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Importar Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
