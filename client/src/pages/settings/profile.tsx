import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface UserSettings {
  id: string;
  name: string;
  displayName: string | null;
  prefixMode: "prefix" | "firstLine" | "none";
  avatarUrl: string | null;
}

const profileFormSchema = z.object({
  prefixMode: z.enum(["prefix", "firstLine", "none"]),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { 
      prefixMode: "prefix",
    },
  });

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ["/api/users/me/settings"],
    queryFn: async () => {
      const res = await authFetch("/api/users/me/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (data: Partial<ProfileFormData & { avatarUrl?: string }>) => {
      const res = await authFetch("/api/users/me/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Configuracoes salvas com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao salvar configuracoes", variant: "destructive" });
    },
  });

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch("/api/upload", {
        method: "POST",
        body: formData,
        headers: {},
      });

      if (!res.ok) throw new Error("Falha ao enviar foto");

      const data = await res.json();
      await updateSettings.mutateAsync({ avatarUrl: data.url });
    } catch (error: any) {
      toast({ title: error.message || "Erro ao enviar foto", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (settings && !form.formState.isDirty) {
    const currentValues = form.getValues();
    if (currentValues.prefixMode !== settings.prefixMode) {
      form.reset({
        prefixMode: settings.prefixMode || "prefix",
      });
    }
  }

  const handleSubmit = (data: ProfileFormData) => {
    updateSettings.mutate(data);
  };

  const prefixModeOptions = [
    {
      value: "prefix",
      label: "Prefixo antes da mensagem",
      description: `Exemplo: [${settings?.name || user?.name || "Operador"}]: Mensagem`,
    },
    {
      value: "firstLine",
      label: "Nome na primeira linha",
      description: `Exemplo:\n${settings?.name || user?.name || "Operador"}:\nMensagem`,
    },
    {
      value: "none",
      label: "Sem identificacao",
      description: "Mensagem enviada sem identificacao do operador",
    },
  ] as const;

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Meu Perfil</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure sua foto e como seu nome aparece nas mensagens
            </p>
          </div>

          {isLoading ? (
            <LoadingCard />
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Foto de Perfil
                  </CardTitle>
                  <CardDescription>
                    Sua foto sera exibida para outros usuarios do sistema
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <Avatar className="h-24 w-24">
                        <AvatarImage src={settings?.avatarUrl || undefined} />
                        <AvatarFallback className="text-2xl">
                          {getInitials(settings?.name || user?.name || "U")}
                        </AvatarFallback>
                      </Avatar>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAvatarUpload(file);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        data-testid="button-upload-avatar"
                      >
                        {uploadingAvatar ? (
                          <LoadingSpinner size="sm" className="mr-2" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {settings?.avatarUrl ? "Trocar Foto" : "Enviar Foto"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        JPG, PNG ou GIF. Max 5MB.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Identificacao nas Mensagens
                  </CardTitle>
                  <CardDescription>
                    Seu nome ({settings?.name || user?.name}) sera usado para identificar suas mensagens
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                      <FormField
                        control={form.control}
                        name="prefixMode"
                        render={({ field }) => (
                          <FormItem className="space-y-4">
                            <FormLabel>Modo de Identificacao</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex flex-col space-y-3"
                              >
                                {prefixModeOptions.map((option) => (
                                  <div 
                                    key={option.value}
                                    className="flex items-start space-x-3 p-3 rounded-md border bg-muted/30"
                                  >
                                    <RadioGroupItem 
                                      value={option.value} 
                                      id={option.value}
                                      className="mt-1"
                                      data-testid={`radio-prefix-mode-${option.value}`}
                                    />
                                    <Label 
                                      htmlFor={option.value}
                                      className="flex flex-col cursor-pointer flex-1"
                                    >
                                      <span className="font-medium">{option.label}</span>
                                      <span className="text-sm text-muted-foreground whitespace-pre-line">
                                        {option.description}
                                      </span>
                                    </Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end pt-4">
                        <Button
                          type="submit"
                          disabled={updateSettings.isPending}
                          data-testid="button-save-profile"
                        >
                          {updateSettings.isPending ? (
                            <LoadingSpinner size="sm" className="text-primary-foreground" />
                          ) : (
                            "Salvar Alteracoes"
                          )}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
