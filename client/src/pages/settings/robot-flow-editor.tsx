import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  Handle,
  Position,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, Plus, MessageSquare, Clock, Tag as TagIcon, GitBranch, Sparkles, Hourglass, MessageCircleQuestion, Mic, Image, Video, FileText, Play, UserCircle, Circle, Layers, Search, Calendar, Zap, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Robot, Tag, User, ContactAttribute, Stage } from "@shared/schema";

const blockTypes = [
  { type: "send_text", label: "Texto", icon: MessageSquare, color: "#3B82F6", category: "Mensagens" },
  { type: "send_image", label: "Imagem", icon: Image, color: "#8B5CF6", category: "Mensagens" },
  { type: "send_audio", label: "Audio", icon: Mic, color: "#EC4899", category: "Mensagens" },
  { type: "send_video", label: "Video", icon: Video, color: "#F59E0B", category: "Mensagens" },
  { type: "send_document", label: "Documento", icon: FileText, color: "#10B981", category: "Mensagens" },
  { type: "ask_question", label: "Perguntar", icon: MessageCircleQuestion, color: "#7C3AED", category: "Input" },
  { type: "button_choice", label: "Botoes", icon: Layers, color: "#0EA5E9", category: "Input" },
  { type: "smart_typing", label: "Digitacao Inteligente", icon: Sparkles, color: "#1565C0", category: "Humano" },
  { type: "human_delay", label: "Pausa Humana", icon: Hourglass, color: "#059669", category: "Humano" },
  { type: "wait_response", label: "Aguardar Resposta", icon: MessageCircleQuestion, color: "#7C3AED", category: "Humano" },
  { type: "conditional", label: "Condicao", icon: GitBranch, color: "#F59E0B", category: "Logica" },
  { type: "goto_robot", label: "Ir para Robo", icon: Zap, color: "#EF4444", category: "Logica" },
  { type: "simulate_typing", label: "Digitando...", icon: MessageSquare, color: "#6366F1", category: "Simulacao" },
  { type: "simulate_recording", label: "Gravando...", icon: Mic, color: "#D946EF", category: "Simulacao" },
  { type: "delay", label: "Aguardar", icon: Clock, color: "#F97316", category: "Tempo" },
  { type: "random_delay", label: "Tempo Randomico", icon: Timer, color: "#A855F7", category: "Tempo" },
  { type: "add_tag", label: "Adicionar Etiqueta", icon: TagIcon, color: "#14B8A6", category: "Etiquetas" },
  { type: "remove_tag", label: "Remover Etiqueta", icon: TagIcon, color: "#EF4444", category: "Etiquetas" },
  { type: "remove_all_tags", label: "Remover Todas", icon: TagIcon, color: "#DC2626", category: "Etiquetas" },
  { type: "set_status", label: "Alterar Status", icon: Play, color: "#0EA5E9", category: "Status" },
  { type: "assign_agent", label: "Atribuir Atendente", icon: UserCircle, color: "#84CC16", category: "Atendente" },
  { type: "webhook", label: "Webhook", icon: Zap, color: "#6366F1", category: "Integracao" },
  { type: "add_attribute", label: "Add Atributo", icon: Circle, color: "#14B8A6", category: "Atributos" },
  { type: "remove_attribute", label: "Remover Atributo", icon: Circle, color: "#EF4444", category: "Atributos" },
  { type: "remove_all_attributes", label: "Limpar Atributos", icon: Circle, color: "#DC2626", category: "Atributos" },
  { type: "move_stage", label: "Mover Estagio", icon: Layers, color: "#F59E0B", category: "Kanban" },
  { type: "schedule_followup", label: "Agendar Followup", icon: Calendar, color: "#0EA5E9", category: "Agendamento" },
];

interface FlowNodeData {
  type: string;
  label: string;
  color: string;
  icon: any;
  content?: string;
  tagId?: string;
  tagName?: string;
  delayMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  conditionType?: string;
  conditionValue?: string;
  status?: string;
  agentId?: string;
  mediaUrl?: string;
  fileName?: string;
  variableName?: string;
  buttons?: string[];
  gotoRobotId?: string;
  webhookUrl?: string;
  waitTimeoutSeconds?: number;
  fallbackAction?: string;
  [key: string]: any;
}

function FlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const Icon = data.icon;
  
  return (
    <div 
      className={`min-w-[200px] max-w-[280px] rounded-lg border-2 bg-card shadow-lg transition-all ${selected ? "ring-2 ring-primary" : ""}`}
      style={{ borderColor: data.color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-3 !h-3" />
      
      <div 
        className="flex items-center gap-2 px-3 py-2 rounded-t-md text-white text-sm font-medium"
        style={{ backgroundColor: data.color }}
      >
        <Icon className="h-4 w-4" />
        <span>{data.label}</span>
      </div>
      
      <div className="p-3 text-sm space-y-1">
        {data.type === "send_text" && data.content && (
          <p className="text-muted-foreground line-clamp-2">"{data.content}"</p>
        )}
        {data.type === "ask_question" && (
          <>
            <p className="text-muted-foreground line-clamp-2">{data.content || "Qual sua pergunta?"}</p>
            {data.variableName && <Badge variant="secondary" className="text-xs">Salvar em: {data.variableName}</Badge>}
          </>
        )}
        {data.type === "button_choice" && (
          <>
            <p className="text-muted-foreground line-clamp-1">{data.content || "Escolha uma opcao:"}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {(data.buttons || []).slice(0, 3).map((btn, i) => (
                <Badge key={i} variant="outline" className="text-xs">{btn}</Badge>
              ))}
              {(data.buttons || []).length > 3 && <Badge variant="outline" className="text-xs">+{(data.buttons || []).length - 3}</Badge>}
            </div>
          </>
        )}
        {(data.type === "send_image" || data.type === "send_audio" || data.type === "send_video" || data.type === "send_document") && (
          <p className="text-muted-foreground text-xs">{data.fileName || "Clique para upload"}</p>
        )}
        {data.type === "conditional" && (
          <p className="text-muted-foreground">
            {data.conditionType === "first_message" && "Primeira mensagem"}
            {data.conditionType === "keyword" && `Palavra: ${data.conditionValue || "..."}`}
            {data.conditionType === "has_tag" && `Tem tag: ${data.conditionValue || "..."}`}
            {data.conditionType === "no_tag" && `Sem tag: ${data.conditionValue || "..."}`}
            {data.conditionType === "has_attribute" && `Tem atributo: ${data.conditionValue || "..."}`}
            {!data.conditionType && "Clique para configurar"}
          </p>
        )}
        {data.type === "goto_robot" && (
          <p className="text-muted-foreground">{data.gotoRobotName || "Selecionar robo..."}</p>
        )}
        {data.type === "human_delay" && (
          <p className="text-muted-foreground">{(data.minDelayMs || 1000)/1000}s - {(data.maxDelayMs || 3000)/1000}s</p>
        )}
        {data.type === "delay" && (
          <p className="text-muted-foreground">{(data.delayMs || 2000)/1000}s</p>
        )}
        {data.type === "random_delay" && (
          <p className="text-muted-foreground">1-3s aleatorio</p>
        )}
        {data.type === "smart_typing" && (
          <p className="text-muted-foreground">Auto (50-80ms/char)</p>
        )}
        {data.type === "wait_response" && (
          <p className="text-muted-foreground">Timeout: {data.waitTimeoutSeconds || 60}s</p>
        )}
        {(data.type === "add_tag" || data.type === "remove_tag") && data.tagName && (
          <Badge variant="secondary" className="text-xs">{data.tagName}</Badge>
        )}
        {data.type === "remove_all_tags" && (
          <p className="text-muted-foreground">Limpar etiquetas</p>
        )}
        {(data.type === "add_attribute" || data.type === "remove_attribute") && data.attributeName && (
          <Badge variant="secondary" className="text-xs">{data.attributeName}</Badge>
        )}
        {data.type === "remove_all_attributes" && (
          <p className="text-muted-foreground">Limpar atributos</p>
        )}
        {data.type === "move_stage" && data.stageName && (
          <Badge variant="secondary" className="text-xs">{data.stageName}</Badge>
        )}
        {data.type === "schedule_followup" && (
          <p className="text-xs text-muted-foreground">{data.followupDelayMinutes || 60} min</p>
        )}
        {data.type === "set_status" && (
          <Badge variant={data.status === "resolved" ? "default" : "secondary"} className="text-xs">{data.status || "..."}</Badge>
        )}
        {data.type === "webhook" && (
          <p className="text-muted-foreground text-xs truncate">{data.webhookUrl || "Configurar URL..."}</p>
        )}
        {(data.type === "simulate_typing" || data.type === "simulate_recording") && (
          <p className="text-muted-foreground">{(data.delayMs || 3000)/1000}s</p>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-3 !h-3" />
    </div>
  );
}

const nodeTypes = {
  flowNode: FlowNode,
};

export default function RobotFlowEditor() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const robotId = params.id;
  const isNew = robotId === "new";
  const authFetch = useAuthFetch();
  const { toast } = useToast();

  const [robotName, setRobotName] = useState("");
  const [robotDescription, setRobotDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isAutomatic, setIsAutomatic] = useState(false);
  const [triggers, setTriggers] = useState<any[]>([]);
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null);
  const [showBlockSelector, setShowBlockSelector] = useState(false);
  const [blockSearch, setBlockSearch] = useState("");
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const { data: robot } = useQuery<Robot>({
    queryKey: ["/api/robots", robotId],
    enabled: !isNew && !!robotId,
  });

  const { data: tags = [] } = useQuery<Tag[]>({ queryKey: ["/api/tags"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allRobots = [] } = useQuery<Robot[]>({ queryKey: ["/api/robots"] });
  const { data: contactAttributes = [] } = useQuery<ContactAttribute[]>({ queryKey: ["/api/contact-attributes"] });
  const { data: stages = [] } = useQuery<Stage[]>({ queryKey: ["/api/stages"] });

  useEffect(() => {
    if (robot) {
      setRobotName(robot.name);
      setRobotDescription(robot.description || "");
      setIsActive(robot.isActive);
      setIsAutomatic(robot.isAutomatic);
      setTriggers(robot.triggers as any[] || []);
      
      const actions = (robot.actions as any[]) || [];
      const newNodes: Node<FlowNodeData>[] = actions.map((action, index) => {
        const blockType = blockTypes.find(b => b.type === action.type);
        const tag = tags.find(t => t.id === action.tagId);
        const attr = contactAttributes.find(a => a.id === action.attributeId);
        const gotoRobot = allRobots.find(r => r.id === action.gotoRobotId);
        const stage = stages.find(s => s.id === action.stageId);
        return {
          id: action.id || `node_${index}`,
          type: "flowNode",
          position: { x: 300, y: 100 + index * 150 },
          data: {
            ...action,
            label: blockType?.label || action.type,
            color: blockType?.color || "#6B7280",
            icon: blockType?.icon || Zap,
            tagName: tag?.name,
            attributeName: attr?.name,
            gotoRobotName: gotoRobot?.name,
            stageName: stage?.name,
          },
        };
      });
      
      const newEdges: Edge[] = [];
      for (let i = 0; i < newNodes.length - 1; i++) {
        newEdges.push({
          id: `edge_${i}`,
          source: newNodes[i].id,
          target: newNodes[i + 1].id,
          type: "smoothstep",
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      }
      
      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [robot, tags, contactAttributes, allRobots, stages, setNodes, setEdges]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ 
      ...params, 
      type: "smoothstep",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed } 
    }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node as Node<FlowNodeData>);
  }, []);

  const addBlock = (blockType: typeof blockTypes[0]) => {
    const newNode: Node<FlowNodeData> = {
      id: `node_${Date.now()}`,
      type: "flowNode",
      position: { x: 300, y: (nodes.length * 150) + 100 },
      data: {
        type: blockType.type,
        label: blockType.label,
        color: blockType.color,
        icon: blockType.icon,
      },
    };
    
    setNodes((nds) => [...nds, newNode]);
    
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      setEdges((eds) => [...eds, {
        id: `edge_${Date.now()}`,
        source: lastNode.id,
        target: newNode.id,
        type: "smoothstep",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      }]);
    }
    
    setShowBlockSelector(false);
    setSelectedNode(newNode);
  };

  const updateNodeData = (nodeId: string, newData: Partial<FlowNodeData>) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id === nodeId) {
        return { ...node, data: { ...node.data, ...newData } };
      }
      return node;
    }));
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ...newData } });
    }
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const topologicalSort = (): Node<FlowNodeData>[] => {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const incomingEdges = new Map<string, string[]>();
        const outgoingEdges = new Map<string, string[]>();
        
        nodes.forEach(n => {
          incomingEdges.set(n.id, []);
          outgoingEdges.set(n.id, []);
        });
        
        edges.forEach(e => {
          incomingEdges.get(e.target)?.push(e.source);
          outgoingEdges.get(e.source)?.push(e.target);
        });
        
        const noIncoming = nodes.filter(n => (incomingEdges.get(n.id)?.length || 0) === 0);
        const startNode = noIncoming.length > 0 
          ? noIncoming.sort((a, b) => a.position.y - b.position.y)[0]
          : nodes.sort((a, b) => a.position.y - b.position.y)[0];
        
        if (!startNode) return [];
        
        const result: Node<FlowNodeData>[] = [];
        const visited = new Set<string>();
        const queue = [startNode.id];
        
        while (queue.length > 0) {
          const nodeId = queue.shift()!;
          if (visited.has(nodeId)) continue;
          visited.add(nodeId);
          
          const node = nodeMap.get(nodeId);
          if (node) result.push(node);
          
          const children = outgoingEdges.get(nodeId) || [];
          children.sort((a, b) => {
            const nodeA = nodeMap.get(a);
            const nodeB = nodeMap.get(b);
            return (nodeA?.position.y || 0) - (nodeB?.position.y || 0);
          });
          queue.push(...children);
        }
        
        nodes.forEach(n => {
          if (!visited.has(n.id)) result.push(n);
        });
        
        return result;
      };
      
      const sortedNodes = topologicalSort();
      
      const actions = sortedNodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        content: node.data.content,
        tagId: node.data.tagId,
        delayMs: node.data.delayMs,
        minDelayMs: node.data.minDelayMs,
        maxDelayMs: node.data.maxDelayMs,
        conditionType: node.data.conditionType,
        conditionValue: node.data.conditionValue,
        status: node.data.status,
        agentId: node.data.agentId,
        waitTimeoutSeconds: node.data.waitTimeoutSeconds,
        fallbackAction: node.data.fallbackAction,
        mediaUrl: node.data.mediaUrl,
        fileName: node.data.fileName,
        variableName: node.data.variableName,
        buttons: node.data.buttons,
        gotoRobotId: node.data.gotoRobotId,
        webhookUrl: node.data.webhookUrl,
        webhookMethod: node.data.webhookMethod,
        attributeId: node.data.attributeId,
        stageId: node.data.stageId,
        followupDelayMinutes: node.data.followupDelayMinutes,
      }));

      const robotData = {
        name: robotName,
        description: robotDescription,
        isActive,
        isAutomatic,
        triggers: triggers.length > 0 ? triggers : [{ type: "first_message", isActive: true }],
        actions,
      };

      let response;
      if (isNew) {
        response = await authFetch("/api/robots", {
          method: "POST",
          body: JSON.stringify(robotData),
        });
      } else {
        response = await authFetch(`/api/robots/${robotId}`, {
          method: "PUT",
          body: JSON.stringify(robotData),
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Falha ao salvar robo");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Robo salvo com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/robots"] });
      navigate("/settings/robots");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  const groupedBlocks = blockTypes.reduce((acc, block) => {
    if (!acc[block.category]) acc[block.category] = [];
    acc[block.category].push(block);
    return acc;
  }, {} as Record<string, typeof blockTypes>);

  const filteredGroupedBlocks = Object.entries(groupedBlocks).reduce((acc, [category, blocks]) => {
    const filtered = blocks.filter(block => 
      block.label.toLowerCase().includes(blockSearch.toLowerCase()) ||
      block.type.toLowerCase().includes(blockSearch.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {} as Record<string, typeof blockTypes>);

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings/robots")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <Input
              value={robotName}
              onChange={(e) => setRobotName(e.target.value)}
              placeholder="Nome do robo"
              className="text-lg font-semibold border-0 bg-transparent px-0 focus-visible:ring-0"
              data-testid="input-robot-name"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-sm">Ativo</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isAutomatic} onCheckedChange={setIsAutomatic} />
            <Label className="text-sm">Automatico</Label>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save">
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r bg-card p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar blocos..."
              value={blockSearch}
              onChange={(e) => setBlockSearch(e.target.value)}
              className="h-8"
              data-testid="input-block-search"
            />
          </div>
          {Object.entries(filteredGroupedBlocks).map(([category, blocks]) => (
            <div key={category} className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">{category}</p>
              <div className="space-y-1">
                {blocks.map((block) => {
                  const Icon = block.icon;
                  return (
                    <button
                      key={block.type}
                      onClick={() => addBlock(block)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors text-left"
                      style={{ borderLeft: `3px solid ${block.color}` }}
                      data-testid={`block-${block.type}`}
                    >
                      <Icon className="h-4 w-4" style={{ color: block.color }} />
                      <span>{block.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-muted/30"
          >
            <Controls />
            <MiniMap />
            <Background gap={20} size={1} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <aside className="w-80 border-l bg-card p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Configurar Bloco</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>×</Button>
            </div>
            
            <div className="space-y-4">
              <div 
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: selectedNode.data.color }}
              >
                <selectedNode.data.icon className="h-4 w-4" />
                <span>{selectedNode.data.label}</span>
              </div>

              {selectedNode.data.type === "send_text" && (
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    value={selectedNode.data.content || ""}
                    onChange={(e) => updateNodeData(selectedNode.id, { content: e.target.value })}
                    placeholder="Digite a mensagem..."
                    rows={4}
                    data-testid="input-block-content"
                  />
                  <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted rounded">
                    <p className="font-medium">Variaveis disponiveis:</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => {
                        const current = selectedNode.data.content || "";
                        updateNodeData(selectedNode.id, { content: current + "{{nome}}" });
                      }}>{"{{nome}}"}</Badge>
                      <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => {
                        const current = selectedNode.data.content || "";
                        updateNodeData(selectedNode.id, { content: current + "{{primeiro_nome}}" });
                      }}>{"{{primeiro_nome}}"}</Badge>
                      <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => {
                        const current = selectedNode.data.content || "";
                        updateNodeData(selectedNode.id, { content: current + "{{telefone}}" });
                      }}>{"{{telefone}}"}</Badge>
                      <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => {
                        const current = selectedNode.data.content || "";
                        updateNodeData(selectedNode.id, { content: current + "{{saudacao}}" });
                      }}>{"{{saudacao}}"}</Badge>
                      <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => {
                        const current = selectedNode.data.content || "";
                        updateNodeData(selectedNode.id, { content: current + "{{periodo_do_dia}}" });
                      }}>{"{{periodo_do_dia}}"}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">Clique para inserir</p>
                  </div>
                </div>
              )}

              {selectedNode.data.type === "conditional" && (
                <>
                  <div className="space-y-2">
                    <Label>Tipo de Condicao</Label>
                    <Select 
                      value={selectedNode.data.conditionType || "keyword"} 
                      onValueChange={(v) => updateNodeData(selectedNode.id, { conditionType: v })}
                    >
                      <SelectTrigger data-testid="select-condition-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_message">Primeira mensagem</SelectItem>
                        <SelectItem value="keyword">Palavra-chave</SelectItem>
                        <SelectItem value="has_tag">Tem etiqueta</SelectItem>
                        <SelectItem value="no_tag">Nao tem etiqueta</SelectItem>
                        <SelectItem value="has_attribute">Tem atributo</SelectItem>
                        <SelectItem value="no_attribute">Nao tem atributo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedNode.data.conditionType !== "first_message" && (
                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <Input
                        value={selectedNode.data.conditionValue || ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { conditionValue: e.target.value })}
                        placeholder="palavra ou nome da etiqueta"
                        data-testid="input-condition-value"
                      />
                    </div>
                  )}
                </>
              )}

              {selectedNode.data.type === "human_delay" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Minimo (ms)</Label>
                    <Input
                      type="number"
                      value={selectedNode.data.minDelayMs || 1000}
                      onChange={(e) => updateNodeData(selectedNode.id, { minDelayMs: parseInt(e.target.value) })}
                      data-testid="input-min-delay"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximo (ms)</Label>
                    <Input
                      type="number"
                      value={selectedNode.data.maxDelayMs || 3000}
                      onChange={(e) => updateNodeData(selectedNode.id, { maxDelayMs: parseInt(e.target.value) })}
                      data-testid="input-max-delay"
                    />
                  </div>
                </div>
              )}

              {selectedNode.data.type === "delay" && (
                <div className="space-y-2">
                  <Label>Duracao (ms)</Label>
                  <Input
                    type="number"
                    value={selectedNode.data.delayMs || 2000}
                    onChange={(e) => updateNodeData(selectedNode.id, { delayMs: parseInt(e.target.value) })}
                    data-testid="input-delay"
                  />
                </div>
              )}

              {selectedNode.data.type === "wait_response" && (
                <div className="space-y-2">
                  <Label>Timeout (segundos)</Label>
                  <Input
                    type="number"
                    value={selectedNode.data.waitTimeoutSeconds || 60}
                    onChange={(e) => updateNodeData(selectedNode.id, { waitTimeoutSeconds: parseInt(e.target.value) })}
                    data-testid="input-timeout"
                  />
                </div>
              )}

              {(selectedNode.data.type === "add_tag" || selectedNode.data.type === "remove_tag") && (
                <div className="space-y-2">
                  <Label>Etiqueta</Label>
                  <Select 
                    value={selectedNode.data.tagId || ""} 
                    onValueChange={(v) => {
                      const tag = tags.find(t => t.id === v);
                      updateNodeData(selectedNode.id, { tagId: v, tagName: tag?.name });
                    }}
                  >
                    <SelectTrigger data-testid="select-tag">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.data.type === "set_status" && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={selectedNode.data.status || "open"} 
                    onValueChange={(v) => updateNodeData(selectedNode.id, { status: v })}
                  >
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aberto</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="resolved">Resolvido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.data.type === "assign_agent" && (
                <div className="space-y-2">
                  <Label>Atendente</Label>
                  <Select 
                    value={selectedNode.data.agentId || ""} 
                    onValueChange={(v) => updateNodeData(selectedNode.id, { agentId: v })}
                  >
                    <SelectTrigger data-testid="select-agent">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.data.type === "ask_question" && (
                <>
                  <div className="space-y-2">
                    <Label>Pergunta</Label>
                    <Textarea
                      value={selectedNode.data.content || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { content: e.target.value })}
                      placeholder="Digite a pergunta..."
                      rows={3}
                      data-testid="input-question"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Salvar resposta em</Label>
                    <Input
                      value={selectedNode.data.variableName || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { variableName: e.target.value })}
                      placeholder="{{resposta}}"
                      data-testid="input-variable"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout (segundos)</Label>
                    <Input
                      type="number"
                      value={selectedNode.data.waitTimeoutSeconds || 60}
                      onChange={(e) => updateNodeData(selectedNode.id, { waitTimeoutSeconds: parseInt(e.target.value) })}
                      data-testid="input-question-timeout"
                    />
                  </div>
                </>
              )}

              {selectedNode.data.type === "button_choice" && (
                <>
                  <div className="space-y-2">
                    <Label>Mensagem</Label>
                    <Textarea
                      value={selectedNode.data.content || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { content: e.target.value })}
                      placeholder="Escolha uma opcao:"
                      rows={2}
                      data-testid="input-button-message"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Botoes (um por linha)</Label>
                    <Textarea
                      value={(selectedNode.data.buttons || []).join("\n")}
                      onChange={(e) => updateNodeData(selectedNode.id, { buttons: e.target.value.split("\n").filter(b => b.trim()) })}
                      placeholder="Opcao 1&#10;Opcao 2&#10;Opcao 3"
                      rows={4}
                      data-testid="input-buttons"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Salvar escolha em</Label>
                    <Input
                      value={selectedNode.data.variableName || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { variableName: e.target.value })}
                      placeholder="{{escolha}}"
                      data-testid="input-button-variable"
                    />
                  </div>
                </>
              )}

              {selectedNode.data.type === "goto_robot" && (
                <div className="space-y-2">
                  <Label>Ir para Robo</Label>
                  <Select 
                    value={selectedNode.data.gotoRobotId || ""} 
                    onValueChange={(v) => {
                      const r = allRobots.find(r => r.id === v);
                      updateNodeData(selectedNode.id, { gotoRobotId: v, gotoRobotName: r?.name });
                    }}
                  >
                    <SelectTrigger data-testid="select-goto-robot">
                      <SelectValue placeholder="Selecione o robo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allRobots.filter(r => r.id !== robotId).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.data.type === "webhook" && (
                <>
                  <div className="space-y-2">
                    <Label>URL do Webhook</Label>
                    <Input
                      value={selectedNode.data.webhookUrl || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { webhookUrl: e.target.value })}
                      placeholder="https://..."
                      data-testid="input-webhook-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Metodo</Label>
                    <Select 
                      value={selectedNode.data.webhookMethod || "POST"} 
                      onValueChange={(v) => updateNodeData(selectedNode.id, { webhookMethod: v })}
                    >
                      <SelectTrigger data-testid="select-webhook-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {(selectedNode.data.type === "send_image" || selectedNode.data.type === "send_audio" || 
                selectedNode.data.type === "send_video" || selectedNode.data.type === "send_document") && (
                <>
                  <div className="space-y-2">
                    <Label>URL do Arquivo</Label>
                    <Input
                      value={selectedNode.data.mediaUrl || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { mediaUrl: e.target.value })}
                      placeholder="https://... ou /uploads/..."
                      data-testid="input-media-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do Arquivo</Label>
                    <Input
                      value={selectedNode.data.fileName || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { fileName: e.target.value })}
                      placeholder="arquivo.pdf"
                      data-testid="input-media-filename"
                    />
                  </div>
                  {selectedNode.data.type === "send_image" && (
                    <div className="space-y-2">
                      <Label>Legenda (opcional)</Label>
                      <Input
                        value={selectedNode.data.content || ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { content: e.target.value })}
                        placeholder="Legenda da imagem"
                        data-testid="input-media-caption"
                      />
                    </div>
                  )}
                </>
              )}

              {(selectedNode.data.type === "simulate_typing" || selectedNode.data.type === "simulate_recording") && (
                <div className="space-y-2">
                  <Label>Duracao (ms)</Label>
                  <Input
                    type="number"
                    value={selectedNode.data.delayMs || 3000}
                    onChange={(e) => updateNodeData(selectedNode.id, { delayMs: parseInt(e.target.value) })}
                    data-testid="input-simulate-duration"
                  />
                </div>
              )}

              {selectedNode.data.type === "random_delay" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Minimo (ms)</Label>
                    <Input
                      type="number"
                      value={selectedNode.data.minDelayMs || 1000}
                      onChange={(e) => updateNodeData(selectedNode.id, { minDelayMs: parseInt(e.target.value) })}
                      data-testid="input-random-min"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximo (ms)</Label>
                    <Input
                      type="number"
                      value={selectedNode.data.maxDelayMs || 3000}
                      onChange={(e) => updateNodeData(selectedNode.id, { maxDelayMs: parseInt(e.target.value) })}
                      data-testid="input-random-max"
                    />
                  </div>
                </div>
              )}

              {(selectedNode.data.type === "add_attribute" || selectedNode.data.type === "remove_attribute") && (
                <div className="space-y-2">
                  <Label>Atributo</Label>
                  <Select 
                    value={selectedNode.data.attributeId || ""} 
                    onValueChange={(v) => {
                      const attr = contactAttributes.find(a => a.id === v);
                      updateNodeData(selectedNode.id, { attributeId: v, attributeName: attr?.name });
                    }}
                  >
                    <SelectTrigger data-testid="select-attribute">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contactAttributes.map((attr) => (
                        <SelectItem key={attr.id} value={attr.id}>{attr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.data.type === "remove_all_attributes" && (
                <p className="text-sm text-muted-foreground">Remove todos os atributos do contato.</p>
              )}

              {selectedNode.data.type === "remove_all_tags" && (
                <p className="text-sm text-muted-foreground">Remove todas as etiquetas do contato.</p>
              )}

              {selectedNode.data.type === "move_stage" && (
                <div className="space-y-2">
                  <Label>Estagio do Kanban</Label>
                  <Select 
                    value={selectedNode.data.stageId || ""} 
                    onValueChange={(v) => {
                      const stg = stages.find(s => s.id === v);
                      updateNodeData(selectedNode.id, { stageId: v, stageName: stg?.name });
                    }}
                  >
                    <SelectTrigger data-testid="select-stage">
                      <SelectValue placeholder="Selecione o estagio..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stg) => (
                        <SelectItem key={stg.id} value={stg.id}>{stg.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.data.type === "schedule_followup" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Tempo de Espera (minutos)</Label>
                    <Input
                      type="number"
                      value={selectedNode.data.followupDelayMinutes || 60}
                      onChange={(e) => updateNodeData(selectedNode.id, { followupDelayMinutes: parseInt(e.target.value) })}
                      data-testid="input-followup-delay"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem de Followup</Label>
                    <Textarea
                      value={selectedNode.data.content || ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { content: e.target.value })}
                      placeholder="Mensagem a enviar apos o tempo..."
                      rows={3}
                      data-testid="input-followup-message"
                    />
                  </div>
                </div>
              )}

              <Button 
                variant="destructive" 
                size="sm" 
                className="w-full mt-4"
                onClick={() => deleteNode(selectedNode.id)}
                data-testid="button-delete-block"
              >
                Excluir Bloco
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
