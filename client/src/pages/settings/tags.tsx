import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
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
import { TagChip } from "@/components/tag-chip";
import { LoadingSpinner, LoadingCard } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useAuthFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Tag as TagType } from "@shared/schema";

const tagFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Enter a valid hex color"),
});

type TagFormData = z.infer<typeof tagFormSchema>;

const presetColors = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#14B8A6", "#06B6D4",
  "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#D946EF", "#EC4899", "#F43F5E",
];

export default function TagsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);

  const form = useForm<TagFormData>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: { name: "", color: "#3B82F6" },
  });

  const { data: tags = [], isLoading } = useQuery<TagType[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const res = await authFetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json();
    },
  });

  const createTag = useMutation({
    mutationFn: async (data: TagFormData) => {
      const res = await authFetch("/api/tags", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Tag created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateTag = useMutation({
    mutationFn: async (data: TagFormData & { id: string }) => {
      const res = await authFetch(`/api/tags/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: data.name, color: data.color }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setIsDialogOpen(false);
      setEditingTag(null);
      form.reset();
      toast({ title: "Tag updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/tags/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      toast({ title: "Tag deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete tag", variant: "destructive" });
    },
  });

  const handleOpenDialog = (tag?: TagType) => {
    if (tag) {
      setEditingTag(tag);
      form.reset({ name: tag.name, color: tag.color });
    } else {
      setEditingTag(null);
      form.reset({ name: "", color: "#3B82F6" });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: TagFormData) => {
    if (editingTag) {
      updateTag.mutate({ ...data, id: editingTag.id });
    } else {
      createTag.mutate(data);
    }
  };

  const selectedColor = form.watch("color");

  return (
    <DashboardLayout>
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">Tags</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Organize contacts with labels and funnel stages
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} data-testid="button-add-tag">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tag
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTag ? "Edit Tag" : "Create New Tag"}</DialogTitle>
                  <DialogDescription>
                    {editingTag
                      ? "Update tag name and color."
                      : "Create a tag to organize your contacts."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="New Lead" data-testid="input-tag-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color</FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              <div className="flex gap-2 flex-wrap">
                                {presetColors.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={() => form.setValue("color", color)}
                                    className={`w-8 h-8 rounded-full transition-transform ${
                                      selectedColor === color ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
                                    }`}
                                    style={{ backgroundColor: color }}
                                    data-testid={`color-${color}`}
                                  />
                                ))}
                              </div>
                              <Input
                                {...field}
                                placeholder="#3B82F6"
                                data-testid="input-tag-color"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="pt-2">
                      <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                      <TagChip
                        tag={{ id: "preview", name: form.watch("name") || "Tag Name", color: selectedColor, companyId: "", createdAt: new Date(), updatedAt: new Date() }}
                        size="md"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createTag.isPending || updateTag.isPending}
                        data-testid="button-save-tag"
                      >
                        {(createTag.isPending || updateTag.isPending) ? (
                          <LoadingSpinner size="sm" className="text-primary-foreground" />
                        ) : editingTag ? (
                          "Save Changes"
                        ) : (
                          "Create Tag"
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
          ) : tags.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Tag}
                  title="No tags yet"
                  description="Create tags to organize your contacts and track funnel stages"
                  action={
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Tag
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between gap-4 p-4"
                      data-testid={`tag-row-${tag.id}`}
                    >
                      <TagChip tag={tag} size="md" />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(tag)}
                          data-testid={`button-edit-tag-${tag.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-delete-tag-${tag.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Tag</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this tag? It will be removed from all contacts.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteTag.mutate(tag.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
