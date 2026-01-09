import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ArrowLeft, MapPin, Users, Filter, Phone, RefreshCw, BarChart3, MessageSquare, Tag, TrendingUp, User, Clock, UserPlus, CheckCircle2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/loading-spinner";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { useAuthFetch } from "@/lib/auth";
import { useLocation } from "wouter";
import type { Contact } from "@shared/schema";
import "leaflet/dist/leaflet.css";

interface CrmStats {
  summary: {
    totalMessages: number;
    totalInbound: number;
    totalOutbound: number;
    totalContacts: number;
    totalConversations: number;
    openConversations: number;
    pendingConversations: number;
    resolvedConversations: number;
    avgResponseTimeMinutes: number;
    resolutionRate: number;
    newContactsThisWeek: number;
    newContactsThisMonth: number;
  };
  messagesPerTag: Array<{ tagName: string; tagColor: string; inbound: number; outbound: number; total: number }>;
  contactsPerAttribute: Array<{ attributeName: string; attributeColor: string; count: number }>;
  contactsPerTag: Array<{ tagName: string; tagColor: string; count: number }>;
  topContacts: Array<{ contactId: string; contactName: string; phoneNumber: string; avatarUrl: string | null; inbound: number; outbound: number; total: number }>;
  messagesByHour: number[];
  messagesByDayOfWeek: number[];
  agentPerformance: Array<{ agentId: string; agentName: string; conversations: number; messagesOut: number }>;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function createCustomIcon(color: string) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
}

function MapBounds({ contacts }: { contacts: Contact[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (contacts.length > 0) {
      const bounds = L.latLngBounds(
        contacts.map(c => [c.latitude!, c.longitude!])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [contacts, map]);
  
  return null;
}

export default function ClientsMap() {
  const authFetch = useAuthFetch();
  const [, setLocation] = useLocation();
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("map");

  const { data: contacts = [], isLoading, refetch } = useQuery<Contact[]>({
    queryKey: ["/api/contacts/with-location"],
    queryFn: async () => {
      const res = await authFetch("/api/contacts/with-location");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  const { data: allContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const res = await authFetch("/api/contacts");
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });

  const { data: crmStats, isLoading: isLoadingStats, refetch: refetchStats } = useQuery<CrmStats>({
    queryKey: ["/api/crm-stats"],
    queryFn: async () => {
      const res = await authFetch("/api/crm-stats");
      if (!res.ok) throw new Error("Failed to fetch CRM stats");
      return res.json();
    },
    enabled: activeTab === "reports",
  });

  const cities = Array.from(new Set(contacts.map(c => c.city).filter(Boolean))).sort() as string[];
  const states = Array.from(new Set(contacts.map(c => c.state).filter(Boolean))).sort() as string[];

  const filteredContacts = contacts.filter(c => {
    if (cityFilter !== "all" && c.city !== cityFilter) return false;
    if (stateFilter !== "all" && c.state !== stateFilter) return false;
    return true;
  });

  const contactsWithoutLocation = allContacts.filter(c => !c.latitude || !c.longitude);

  const cityCounts: Record<string, number> = {};
  contacts.forEach(c => {
    if (c.city) {
      cityCounts[c.city] = (cityCounts[c.city] || 0) + 1;
    }
  });
  
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b flex items-center gap-3 px-4 shrink-0 bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          data-testid="button-back-from-map"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <MapPin className="h-5 w-5 text-primary" />
        <h1 className="font-semibold text-lg">Mapa dos Clientes</h1>
        <div className="ml-auto flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mr-4">
            <TabsList>
              <TabsTrigger value="map" className="gap-2" data-testid="tab-map">
                <MapPin className="h-4 w-4" />
                Mapa
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-2" data-testid="tab-reports">
                <BarChart3 className="h-4 w-4" />
                Relatórios
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={() => activeTab === "map" ? refetch() : refetchStats()}
            className="gap-2"
            data-testid="button-refresh-map"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </header>

      {activeTab === "map" && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <aside className="w-full md:w-72 border-b md:border-b-0 md:border-r bg-sidebar p-4 overflow-auto shrink-0">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Resumo
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Card className="p-3">
                  <p className="text-2xl font-bold text-primary">{contacts.length}</p>
                  <p className="text-xs text-muted-foreground">Com localização</p>
                </Card>
                <Card className="p-3">
                  <p className="text-2xl font-bold text-muted-foreground">{contactsWithoutLocation.length}</p>
                  <p className="text-xs text-muted-foreground">Sem localização</p>
                </Card>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </h3>
              <div className="space-y-2">
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger data-testid="select-state-filter">
                    <SelectValue placeholder="Filtrar por Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Estados</SelectItem>
                    {states.map(state => (
                      <SelectItem key={state} value={state!}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger data-testid="select-city-filter">
                    <SelectValue placeholder="Filtrar por Cidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Cidades</SelectItem>
                    {cities.map(city => (
                      <SelectItem key={city} value={city!}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {topCities.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Top Cidades</h3>
                <div className="space-y-1">
                  {topCities.map(([city, count]) => (
                    <div 
                      key={city} 
                      className="flex items-center justify-between text-sm p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => setCityFilter(city)}
                    >
                      <span className="truncate">{city}</span>
                      <Badge variant="secondary" className="ml-2">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredContacts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Clientes no Mapa ({filteredContacts.length})
                </h3>
                <div className="space-y-1 max-h-48 overflow-auto">
                  {filteredContacts.slice(0, 20).map(contact => (
                    <div 
                      key={contact.id} 
                      className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer text-sm"
                    >
                      <AvatarWithFallback name={contact.name} src={contact.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{contact.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{contact.city}</p>
                      </div>
                    </div>
                  ))}
                  {filteredContacts.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{filteredContacts.length - 20} mais...
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="flex-1 relative">
          {filteredContacts.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <Card className="p-6 text-center max-w-sm">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <CardTitle className="mb-2">Nenhum cliente com localização</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Adicione a cidade dos seus contatos no painel de detalhes para visualizá-los no mapa.
                </p>
              </Card>
            </div>
          ) : (
            <MapContainer
              center={[-14.235, -51.925]}
              zoom={4}
              className="h-full w-full"
              style={{ background: "#f0f0f0" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBounds contacts={filteredContacts} />
              {filteredContacts.map(contact => (
                <Marker
                  key={contact.id}
                  position={[contact.latitude!, contact.longitude!]}
                  icon={createCustomIcon("#1565c0")}
                >
                  <Popup>
                    <div className="min-w-[180px]">
                      <div className="flex items-center gap-2 mb-2">
                        <AvatarWithFallback name={contact.name} src={contact.avatarUrl} size="sm" />
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phoneNumber}
                          </p>
                        </div>
                      </div>
                      {contact.city && (
                        <p className="text-sm flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {contact.city}{contact.state ? `, ${contact.state}` : ""}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>
      </div>
      )}

      {activeTab === "reports" && (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {isLoadingStats ? (
            <div className="flex items-center justify-center h-64">
              <LoadingSpinner />
            </div>
          ) : crmStats ? (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{crmStats.summary.totalMessages}</p>
                        <p className="text-xs text-muted-foreground">Total de Mensagens</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{crmStats.summary.totalInbound}</p>
                        <p className="text-xs text-muted-foreground">Recebidas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <MessageSquare className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{crmStats.summary.totalOutbound}</p>
                        <p className="text-xs text-muted-foreground">Enviadas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <Users className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{crmStats.summary.totalContacts}</p>
                        <p className="text-xs text-muted-foreground">Contatos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/10">
                        <Clock className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {(crmStats.summary.avgResponseTimeMinutes || 0) > 60 
                            ? `${Math.round((crmStats.summary.avgResponseTimeMinutes || 0) / 60)}h` 
                            : `${crmStats.summary.avgResponseTimeMinutes || 0}m`}
                        </p>
                        <p className="text-xs text-muted-foreground">Tempo Médio Resposta</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{crmStats.summary.resolutionRate || 0}%</p>
                        <p className="text-xs text-muted-foreground">Taxa de Resolução</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-500/10">
                        <UserPlus className="h-5 w-5 text-cyan-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{crmStats.summary.newContactsThisWeek || 0}</p>
                        <p className="text-xs text-muted-foreground">Novos Esta Semana</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-pink-500/10">
                        <UserPlus className="h-5 w-5 text-pink-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{crmStats.summary.newContactsThisMonth || 0}</p>
                        <p className="text-xs text-muted-foreground">Novos Este Mês</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Contatos por Funil (Tags)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {crmStats.contactsPerTag.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tag atribuída</p>
                    ) : (
                      <div className="space-y-3">
                        {crmStats.contactsPerTag.map((tag, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: tag.tagColor }}
                              />
                              <span className="text-sm">{tag.tagName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div 
                                className="h-2 rounded-full bg-muted flex-1 max-w-[100px]"
                              >
                                <div 
                                  className="h-2 rounded-full transition-all"
                                  style={{ 
                                    width: `${Math.min((tag.count / Math.max(1, ...crmStats.contactsPerTag.map(t => t.count))) * 100, 100)}%`,
                                    backgroundColor: tag.tagColor 
                                  }}
                                />
                              </div>
                              <Badge variant="secondary" className="min-w-[40px] justify-center">{tag.count}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Contatos por Atributo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {crmStats.contactsPerAttribute.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum atributo atribuído</p>
                    ) : (
                      <div className="space-y-3">
                        {crmStats.contactsPerAttribute.map((attr, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: attr.attributeColor }}
                              />
                              <span className="text-sm">{attr.attributeName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div 
                                className="h-2 rounded-full bg-muted flex-1 max-w-[100px]"
                              >
                                <div 
                                  className="h-2 rounded-full transition-all"
                                  style={{ 
                                    width: `${Math.min((attr.count / Math.max(1, ...crmStats.contactsPerAttribute.map(a => a.count))) * 100, 100)}%`,
                                    backgroundColor: attr.attributeColor 
                                  }}
                                />
                              </div>
                              <Badge variant="secondary" className="min-w-[40px] justify-center">{attr.count}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Mensagens por Funil (Tags)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {crmStats.messagesPerTag.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem com tag</p>
                    ) : (
                      <div className="space-y-3">
                        {crmStats.messagesPerTag.map((tag, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: tag.tagColor }}
                              />
                              <span className="text-sm">{tag.tagName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-green-600">↓ {tag.inbound}</span>
                              <span className="text-blue-600">↑ {tag.outbound}</span>
                              <Badge variant="secondary" className="min-w-[40px] justify-center">{tag.total}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Top 10 Clientes (Mais Mensagens Recebidas)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {crmStats.topContacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum contato com mensagens</p>
                    ) : (
                      <div className="space-y-2">
                        {crmStats.topContacts.map((contact, idx) => (
                          <div key={contact.contactId} className="flex items-center gap-2 p-2 rounded-md hover-elevate">
                            <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                            <AvatarWithFallback name={contact.contactName} src={contact.avatarUrl} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{contact.contactName}</p>
                              <p className="text-xs text-muted-foreground">{contact.phoneNumber}</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs shrink-0">
                              <span className="text-green-600" title="Recebidas">↓{contact.inbound}</span>
                              <span className="text-blue-600" title="Enviadas">↑{contact.outbound}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Status das Conversas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-sm">Abertas: <strong>{crmStats.summary.openConversations}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span className="text-sm">Pendentes: <strong>{crmStats.summary.pendingConversations}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-400" />
                      <span className="text-sm">Resolvidas: <strong>{crmStats.summary.resolvedConversations}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-sm text-muted-foreground">Total: <strong>{crmStats.summary.totalConversations}</strong></span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Mensagens por Hora do Dia
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-32">
                      {(crmStats.messagesByHour || Array(24).fill(0)).map((count, hour) => {
                        const hours = crmStats.messagesByHour || Array(24).fill(0);
                        const maxHour = Math.max(1, ...hours);
                        const height = (count / maxHour) * 100;
                        return (
                          <div 
                            key={hour} 
                            className="flex-1 flex flex-col items-center gap-1"
                            title={`${hour}h: ${count} mensagens`}
                          >
                            <div 
                              className="w-full bg-primary/70 rounded-t transition-all hover:bg-primary"
                              style={{ height: `${Math.max(2, height)}%` }}
                            />
                            {hour % 4 === 0 && (
                              <span className="text-[10px] text-muted-foreground">{hour}h</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Mensagens por Dia da Semana
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day, idx) => {
                        const days = crmStats.messagesByDayOfWeek || Array(7).fill(0);
                        const count = days[idx] || 0;
                        const maxDay = Math.max(1, ...days);
                        const width = (count / maxDay) * 100;
                        return (
                          <div key={day} className="flex items-center gap-2">
                            <span className="text-xs w-8 text-muted-foreground">{day}</span>
                            <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary/70 rounded-full transition-all"
                                style={{ width: `${Math.max(2, width)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {(crmStats.agentPerformance || []).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Performance por Agente
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {(crmStats.agentPerformance || []).map((agent) => (
                        <div key={agent.agentId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <AvatarWithFallback name={agent.agentName} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{agent.agentName}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{agent.conversations} conversas</span>
                              <span>{agent.messagesOut} enviadas</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Erro ao carregar estatísticas</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
