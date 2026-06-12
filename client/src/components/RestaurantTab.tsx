import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Tag, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { segmentColor } from "@/lib/palette";
import { toast } from "sonner";

interface RestaurantTabProps {
  wheelId: number;
  isOwner: boolean;
  onRestaurantsChange: () => void;
}

interface RestaurantForm {
  name: string;
  notes: string;
  tagIds: number[];
}

const EMPTY_FORM: RestaurantForm = { name: "", notes: "", tagIds: [] };

export default function RestaurantTab({ wheelId, isOwner, onRestaurantsChange }: RestaurantTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<RestaurantForm>(EMPTY_FORM);
  const [newTagName, setNewTagName] = useState("");
  const [showTagCreate, setShowTagCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const utils = trpc.useUtils();
  const { data: restaurants, isLoading } = trpc.restaurants.list.useQuery({ wheelId });
  const { data: tags } = trpc.tags.list.useQuery({ wheelId });

  const invalidate = () => {
    utils.restaurants.list.invalidate({ wheelId });
    onRestaurantsChange();
  };

  const addRestaurant = trpc.restaurants.add.useMutation({
    onSuccess: () => { invalidate(); setShowAdd(false); setForm(EMPTY_FORM); toast.success("Restaurant added!"); },
    onError: (e) => toast.error(e.message),
  });
  const updateRestaurant = trpc.restaurants.update.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); setForm(EMPTY_FORM); toast.success("Restaurant updated!"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRestaurant = trpc.restaurants.delete.useMutation({
    onSuccess: () => { invalidate(); toast.success("Restaurant removed"); },
    onError: (e) => toast.error(e.message),
  });
  const importRestaurants = trpc.restaurants.addBulk.useMutation({
    onSuccess: (res) => {
      invalidate();
      setShowImport(false);
      setImportText("");
      const extras: string[] = [];
      if (res.skipped.duplicates) extras.push(`${res.skipped.duplicates} duplicate${res.skipped.duplicates > 1 ? "s" : ""} skipped`);
      if (res.skipped.tooLong) extras.push(`${res.skipped.tooLong} too long`);
      toast.success(`Added ${res.added} restaurant${res.added !== 1 ? "s" : ""}${extras.length ? ` (${extras.join(", ")})` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const createTag = trpc.tags.createCustom.useMutation({
    onSuccess: () => { utils.tags.list.invalidate({ wheelId }); setNewTagName(""); setShowTagCreate(false); toast.success("Tag created!"); },
    onError: (e) => toast.error(e.message),
  });

  const cuisineTags = tags?.filter((t) => t.category === "cuisine") ?? [];
  const foodTypeTags = tags?.filter((t) => t.category === "food_type") ?? [];
  const customTags = tags?.filter((t) => t.category === "custom") ?? [];

  const toggleFormTag = (tagId: number) => {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId) ? f.tagIds.filter((id) => id !== tagId) : [...f.tagIds, tagId],
    }));
  };

  const openEdit = (r: NonNullable<typeof restaurants>[number]) => {
    setForm({ name: r.name, notes: r.notes ?? "", tagIds: r.tags.map((t) => t.id) });
    setEditId(r.id);
  };

  const submitForm = () => {
    if (!form.name.trim()) return;
    if (editId !== null) {
      updateRestaurant.mutate({ id: editId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds });
    } else {
      addRestaurant.mutate({ wheelId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds });
    }
  };

  const TagSelector = () => (
    <div className="flex flex-col gap-2">
      {[{ label: "Cuisine", items: cuisineTags }, { label: "Food Type", items: foodTypeTags }, { label: "Custom", items: customTags }].map(({ label, items }) =>
        items.length > 0 ? (
          <div key={label}>
            <p className="text-xs text-muted-foreground mb-1.5 tracking-widest" style={{ fontFamily: "var(--font-display)" }}>{label.toUpperCase()}</p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((tag) => {
                const isActive = form.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleFormTag(tag.id)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150"
                    style={{
                      background: isActive ? tag.color + "33" : "oklch(0.16 0.025 260)",
                      border: `1px solid ${isActive ? tag.color : "oklch(0.25 0.03 260)"}`,
                      color: isActive ? tag.color : "oklch(0.65 0.02 260)",
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}
      <button
        type="button"
        onClick={() => setShowTagCreate(true)}
        className="self-start flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus size={12} /> Create custom tag
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          RESTAURANTS
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setImportText(""); setShowImport(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{
              background: "oklch(0.16 0.025 260)",
              border: "1px solid oklch(0.25 0.03 260)",
              color: "oklch(0.85 0.02 260)",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.05em",
            }}
          >
            <ClipboardList size={14} /> IMPORT
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
              color: "white",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.05em",
            }}
          >
            <Plus size={14} /> ADD
          </button>
        </div>
      </div>

      {/* Permissions note */}
      {!isOwner && (
        <p className="text-xs text-muted-foreground px-3 py-2 rounded-lg" style={{ background: "oklch(0.16 0.025 260)", border: "1px solid oklch(0.25 0.03 260)" }}>
          You can add restaurants to this wheel. Only the wheel creator can edit or delete.
        </p>
      )}

      {/* Restaurant list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
        </div>
      ) : restaurants?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="text-4xl mb-3 opacity-30">🍜</div>
          <p>No restaurants yet. Add your first one!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {restaurants?.map((r, i) => {
            const dotColor = segmentColor(r.tags[0]?.color, i);
            return (
            <div
              key={r.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl transition-all duration-150"
              style={{
                background: r.isExcluded ? "oklch(0.12 0.025 260 / 0.5)" : "oklch(0.13 0.025 260)",
                border: r.isExcluded ? "1px solid oklch(0.25 0.03 260 / 0.5)" : "1px solid oklch(0.20 0.025 260)",
                opacity: r.isExcluded ? 0.6 : 1,
              }}
            >
              {/* Color dot — matches this restaurant's slice on the wheel. */}
              <div
                className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                title={r.tags[0]?.name ? `Tagged "${r.tags[0].name}" — its colour on the wheel` : "Its colour on the wheel"}
                style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}88` }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{r.name}</span>
                  {r.isExcluded && (
                    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: "oklch(0.60 0.22 25 / 0.2)", color: "oklch(0.75 0.15 40)", border: "1px solid oklch(0.60 0.22 25 / 0.3)" }}>
                      excluded
                    </span>
                  )}
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.notes}</p>}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.tags.map((t) => (
                      <span
                        key={t.id}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: t.color + "22", color: t.color, border: `1px solid ${t.color}44` }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions (owner only) */}
              {isOwner && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(r)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove "${r.name}"?`)) deleteRestaurant.mutate({ id: r.id }); }}
                    className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={showAdd || editId !== null} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="glass border-border/50 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>
              {editId !== null ? "EDIT RESTAURANT" : "ADD RESTAURANT"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <Input
              placeholder="Restaurant name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-secondary/50 border-border/50"
            />
            <Textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="bg-secondary/50 border-border/50 resize-none"
              rows={2}
            />
            <TagSelector />
            <Button
              onClick={submitForm}
              disabled={!form.name.trim() || addRestaurant.isPending || updateRestaurant.isPending}
              style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))", color: "white" }}
            >
              {addRestaurant.isPending || updateRestaurant.isPending ? "Saving..." : editId !== null ? "Save Changes" : "Add Restaurant"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk import dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) { setShowImport(false); setImportText(""); } }}>
        <DialogContent className="glass border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>IMPORT RESTAURANTS</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Paste a list — one name per line (or comma-separated). Duplicates are skipped. You can add tags afterward.
            </p>
            <Textarea
              placeholder={"Ramen House\nSushi Bar\nPho Corner"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="bg-secondary/50 border-border/50 resize-none font-mono text-sm"
              rows={8}
              autoFocus
            />
            <Button
              onClick={() => importText.trim() && importRestaurants.mutate({ wheelId, text: importText })}
              disabled={!importText.trim() || importRestaurants.isPending}
              style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))", color: "white" }}
            >
              {importRestaurants.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom tag creation dialog */}
      <Dialog open={showTagCreate} onOpenChange={setShowTagCreate}>
        <DialogContent className="glass border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>CREATE CUSTOM TAG</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newTagName.trim() && createTag.mutate({ name: newTagName.trim(), wheelId })}
              className="bg-secondary/50 border-border/50"
            />
            <Button
              onClick={() => newTagName.trim() && createTag.mutate({ name: newTagName.trim(), wheelId })}
              disabled={!newTagName.trim() || createTag.isPending}
              size="icon"
              style={{ background: "oklch(0.72 0.22 30)", color: "white" }}
            >
              <Check size={16} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
