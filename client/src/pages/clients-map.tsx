import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ArrowLeft, MapPin, Users, Filter, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { AvatarWithFallback } from "@/components/avatar-with-fallback";
import { useAuthFetch } from "@/lib/auth";
import { useLocation } from "wouter";
import type { Contact } from "@shared/schema";
import "leaflet/dist/leaflet.css";

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
            data-testid="button-refresh-map"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </header>

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
    </div>
  );
}
