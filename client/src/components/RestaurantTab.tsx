import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Tag, ClipboardList, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { segmentColor } from "@/lib/palette";
import { toast } from "sonner";
import { ErrorChip } from "@/components/StatusChip";

interface RestaurantTabProps {
  wheelId: number;
  isOwner: boolean;
  onRestaurantsChange: () => void;
}

interface RestaurantForm {
  name: string;
  notes: string;
  tagIds: number[];
  mapUrl: string;
}

const EMPTY_FORM: RestaurantForm = { name: "", notes: "", tagIds: [], mapUrl: "" };

export default function RestaurantTab({ wheelId, isOwner, onRestaurantsChange }: RestaurantTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<RestaurantForm>(EMPTY_FORM);
  const [newTagName, setNewTagName] = useState("");
  const [showTagCreate, setShowTagCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: restaurants, isLoading } = trpc.restaurants.list.useQuery({ wheelId });
  const { data: tags } = trpc.tags.list.useQuery({ wheelId });

  const invalidate = () => {
    utils.restaurants.list.invalidate({ wheelId });
    onRestaurantsChange();
  };

  const addRestaurant = trpc.restaurants.add.useMutation({
    onSuccess: () => { invalidate(); setShowAdd(false); setForm(EMPTY_FORM); setFormError(null); toast.success("Restaurant added!"); },
    onError: (e) => setFormError(e.message),
  });
  const updateRestaurant = trpc.restaurants.update.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); setForm(EMPTY_FORM); setFormError(null); toast.success("Restaurant updated!"); },
    onError: (e) => setFormError(e.message),
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
    onSuccess: () => { utils.tags.list.invalidate({ wheelId }); setNewTagName(""); setShowTagCreate(false); setTagError(null); toast.success("Tag created!"); },
    onError: (e) => setTagError(e.message),
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
    setForm({ name: r.name, notes: r.notes ?? "", tagIds: r.tags.map((t) => t.id), mapUrl: r.mapUrl ?? "" });
    setEditId(r.id);
  };

  const submitForm = () => {
    if (!form.name.trim()) return;
    const mapUrl = form.mapUrl.trim() || null;
    if (editId !== null) {
      updateRestaurant.mutate({ id: editId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds, mapUrl });
    } else {
      addRestaurant.mutate({ wheelId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds, mapUrl });
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
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight" style={{ fontFamily: "var(--font-display)" }}>RESTAURANTS</h2>
          {restaurants && restaurants.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{restaurants.length} place{restaurants.length !== 1 ? "s" : ""} on this wheel</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => { setImportText(""); setShowImport(true); }}
            title="Import"
            className="flex items-center justify-center gap-2 h-9 min-w-9 px-2.5 sm:px-3 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 hover:bg-white/5"
            style={{
              background: "oklch(0.14 0.025 260)",
              border: "1px solid oklch(0.22 0.025 260)",
              color: "oklch(0.70 0.02 260)",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
            }}
          >
            <ClipboardList size={14} /> <span className="hidden sm:inline">IMPORT</span>
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}
            title="Add restaurant"
            className="flex items-center justify-center gap-2 h-9 min-w-9 px-2.5 sm:px-4 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
              color: "white",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
              boxShadow: "0 0 16px oklch(0.72 0.22 30 / 0.35)",
            }}
          >
            <Plus size={14} /> <span className="hidden sm:inline">ADD</span>
          </button>
        </div>
      </div>

      {/* Permissions note */}
      {!isOwner && (
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs"
          style={{
            background: "oklch(0.65 0.25 280 / 0.08)",
            border: "1px solid oklch(0.65 0.25 280 / 0.20)",
            color: "oklch(0.75 0.12 285)",
          }}
        >
          <Tag size={12} className="flex-shrink-0" />
          You can add restaurants. Only the wheel creator can edit or delete.
        </div>
      )}

      {/* Restaurant list */}
      {isLoading ? (
        <div className="flex flex-col gap-2.5">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-[72px] rounded-2xl animate-pulse" style={{ background: "oklch(0.13 0.025 260)", animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : restaurants?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "oklch(0.14 0.025 260)", border: "1px solid oklch(0.20 0.025 260)" }}
          >
            🍜
          </div>
          <div>
            <p className="font-semibold text-foreground/60 mb-1" style={{ fontFamily: "var(--font-display)" }}>NO RESTAURANTS YET</p>
            <p className="text-sm text-muted-foreground">Add your first place to get started</p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 hover:brightness-110 mt-1"
            style={{
              background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
              color: "white",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
            }}
          >
            <Plus size={14} /> ADD FIRST RESTAURANT
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {restaurants?.map((r, i) => {
            const dotColor = segmentColor(r.tags[0]?.color, i);
            return (
            <div
              key={r.id}
              className="group flex items-start gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 hover:scale-[1.005] hover:-translate-y-0.5"
              style={{
                background: r.isExcluded ? "oklch(0.11 0.02 260)" : "oklch(0.13 0.025 260)",
                border: r.isExcluded ? "1px solid oklch(0.18 0.025 260)" : "1px solid oklch(0.20 0.025 260)",
                opacity: r.isExcluded ? 0.55 : 1,
                boxShadow: r.isExcluded ? "none" : "0 2px 12px rgba(0,0,0,0.2)",
              }}
            >
              {/* Color swatch — matches wheel segment */}
              <div
                className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 transition-all duration-200"
                title={r.tags[0]?.name ? `Tagged "${r.tags[0].name}"` : "Wheel color"}
                style={{
                  background: dotColor,
                  boxShadow: `0 0 8px ${dotColor}99`,
                }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{r.name}</span>
                  {r.isExcluded && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{
                        background: "oklch(0.60 0.22 25 / 0.15)",
                        color: "oklch(0.72 0.15 40)",
                        border: "1px solid oklch(0.60 0.22 25 / 0.25)",
                      }}
                    >
                      excluded
                    </span>
                  )}
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.notes}</p>}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.tags.map((t) => (
                      <span
                        key={t.id}
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: t.color + "18",
                          color: t.color,
                          border: `1px solid ${t.color}35`,
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions — always visible on mobile, hover-reveal on desktop */}
              {isOwner && (
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={() => openEdit(r)}
                    className="p-2 rounded-xl hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-90"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove "${r.name}"?`)) deleteRestaurant.mutate({ id: r.id }); }}
                    className="p-2 rounded-xl hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all duration-150 active:scale-90"
                    title="Delete"
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
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="Google Maps link (optional)"
                  value={form.mapUrl}
                  onChange={(e) => setForm((f) => ({ ...f, mapUrl: e.target.value }))}
                  className="bg-secondary/50 border-border/50 pl-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground px-1">
                Paste the place's Google Maps link — "DIRECTIONS" after a spin opens it directly.
              </p>
            </div>
            <TagSelector />
            <ErrorChip error={formError} onDismiss={() => setFormError(null)} />
            <Button
              onClick={() => { setFormError(null); submitForm(); }}
              disabled={!form.name.trim() || addRestaurant.isPending || updateRestaurant.isPending}
              className="transition-all duration-200 active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))", color: "white" }}
            >
              {addRestaurant.isPending || updateRestaurant.isPending ? (
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{editId !== null ? "Saving..." : "Adding..."}</span>
              ) : editId !== null ? "Save Changes" : "Add Restaurant"}
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
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => { setNewTagName(e.target.value); setTagError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && newTagName.trim()) { setTagError(null); createTag.mutate({ name: newTagName.trim(), wheelId }); } }}
                className="bg-secondary/50 border-border/50"
                autoFocus
              />
              <Button
                onClick={() => { setTagError(null); newTagName.trim() && createTag.mutate({ name: newTagName.trim(), wheelId }); }}
                disabled={!newTagName.trim() || createTag.isPending}
                size="icon"
                className="transition-all duration-200 active:scale-90 flex-shrink-0"
                style={{ background: "oklch(0.72 0.22 30)", color: "white" }}
              >
                {createTag.isPending ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
              </Button>
            </div>
            <ErrorChip error={tagError} onDismiss={() => setTagError(null)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
