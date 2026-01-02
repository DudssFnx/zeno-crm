import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "../dashboard";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { useAuthFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface UserSettings {
  id: string;
  displayName: string | null;
  prefixMode: "prefix" | "firstLine" | "none";
}

const profileFormSchema = z.object({
  displayName: z.string().min(1, "Nome de exibição é obrigatório"),
  prefixMode: z.enum(["prefix", "firstLine", "none"]),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { 
      displayName: "",
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
    mutationFn: async (data: ProfileFormData) => {
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
      toast({ title: "Configurações salvas com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Falha ao salvar configurações", variant: "destructive" });
    },
  });

  if (settings && !form.formState.isDirty) {
    const currentValues = form.getValues();
    if (currentValues.displayName !== (settings.displayName || user?.name || "") ||
        currentValues.prefixMode !== settings.prefixMode) {
      form.reset({
        displayName: settings.displayName || user?.name || "",
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
      description: "Exemplo: [Operador Nome]: Mensagem",
    },
    {
      value: "firstLine",
      label: "Nome na primeira linha",
      description: "Exemplo:\nOperador Nome:\nMensagem",
    },
    {
      value: "none",
      label: "Sem identificação",
      description: "Mensagem enviada sem identificação do operador",
    },
  ] as const;

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Meu Perfil</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure como seu nome aparece nas mensagens enviadas
            </p>
          </div>

          {isLoading ? (
            <LoadingCard />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Configurações de Identificação
                </CardTitle>
                <CardDescription>
                  Defina como os clientes verão sua identificação nas mensagens
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome de Exibição</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Digite seu nome de exibição" 
                              data-testid="input-display-name" 
                            />
                          </FormControl>
                          <FormDescription>
                            Este nome será mostrado aos clientes nas mensagens
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="prefixMode"
                      render={({ field }) => (
                        <FormItem className="space-y-4">
                          <FormLabel>Modo de Identificação</FormLabel>
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
                          "Salvar Alterações"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
