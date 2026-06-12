import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Plus, Globe, Lock, ChevronRight, Trash2, Share2, Copy, Settings, Download, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { STARTER_RESTAURANTS } from "@shared/starter";
import { parseWheelImport } from "@shared/transfer";

interface WheelSelectorProps {
  selectedWheelId: number | null;
  onSelect: (id: number) => void;
}

const EXCLUSION_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
];

export default function WheelSelector({ selectedWheelId, onSelect }: WheelSelectorProps) {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [exclusionDays, setExclusionDays] = useState("3");
  const [fairnessMode, setFairnessMode] = useState(false);
  const [rotateCuisines, setRotateCuisines] = useState(false);
  const [addStarterPack, setAddStarterPack] = useState(true);
  const [showInvite, setShowInvite] = useState<{ wheelId: number; token: string; name: string } | null>(null);
  const [editWheel, setEditWheel] = useState<{ id: number; name: string; isShared: boolean; isPublic: boolean; exclusionDays: number; fairnessMode: boolean; rotateCuisines: boolean } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const utils = trpc.useUtils();
  const { data: wheels } = trpc.wheels.list.useQuery();

  const handleExport = async (wheelId: number, name: string) => {
    try {
      const data = await utils.wheels.export.fetch({ id: wheelId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "wheel").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-wheel.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Wheel exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const importWheel = trpc.wheels.import.useMutation({
    onSuccess: (data) => {
      utils.wheels.list.invalidate();
      onSelect(data.id);
      setShowImport(false);
      setImportText("");
      toast.success("Wheel imported!");
    },
    onError: (e) => toast.error(e.message),
  });

  const submitImport = () => {
    try {
      const parsed = parseWheelImport(importText);
      importWheel.mutate(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid wheel file");
    }
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  // Default the starter pack on for a user's very first wheel only.
  useEffect(() => {
    if (wheels) setAddStarterPack(wheels.length === 0);
  }, [wheels]);

  const importStarterPack = trpc.restaurants.addBulk.useMutation();
  const createWheel = trpc.wheels.create.useMutation({
    onSuccess: (data) => {
      utils.wheels.list.invalidate();
      setShowCreate(false);
      setNewName("");
      onSelect(data.id);
      if (addStarterPack) {
        importStarterPack.mutate(
          { wheelId: data.id, text: STARTER_RESTAURANTS.join("\n") },
          { onSuccess: () => utils.restaurants.list.invalidate({ wheelId: data.id }) },
        );
      }
      if (data.inviteToken) {
        const w = wheels?.find(w => w.id === data.id);
        setShowInvite({ wheelId: data.id, token: data.inviteToken, name: newName });
      }
      toast.success("Wheel created!");
    },
  });
  const deleteWheel = trpc.wheels.delete.useMutation({
    onSuccess: () => { utils.wheels.list.invalidate(); toast.success("Wheel deleted"); },
  });
  const regenInvite = trpc.wheels.regenerateInvite.useMutation({
    onSuccess: (data, vars) => {
      const w = wheels?.find(w => w.id === vars.id);
      setShowInvite({ wheelId: vars.id, token: data.inviteToken, name: w?.name ?? "" });
    },
  });
  const updateWheel = trpc.wheels.update.useMutation({
    onSuccess: () => {
      utils.wheels.list.invalidate();
      utils.wheels.get.invalidate();
      utils.restaurants.list.invalidate();
      setEditWheel(null);
      toast.success("Wheel settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteUrl = showInvite ? `${window.location.origin}/join/${showInvite.token}` : "";

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied!");
  };

  return (
    <>
      <aside
        className="w-14 md:w-56 border-r border-border/50 flex flex-col py-3 gap-1 overflow-y-auto flex-shrink-0"
        style={{ background: "oklch(0.10 0.02 260)" }}
      >
        <div className="px-2 md:px-3 mb-2 hidden md:block">
          <span className="text-xs font-semibold text-muted-foreground tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
            MY WHEELS
          </span>
        </div>

        {wheels?.map((wheel) => {
          const isSelected = wheel.id === selectedWheelId;
          const isOwner = wheel.ownerId === user?.id;
          return (
            <div key={wheel.id} className="group relative px-2">
              <button
                onClick={() => onSelect(wheel.id)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all duration-150"
                style={{
                  background: isSelected ? "oklch(0.72 0.22 30 / 0.15)" : "transparent",
                  border: isSelected ? "1px solid oklch(0.72 0.22 30 / 0.3)" : "1px solid transparent",
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  style={{
                    background: isSelected
                      ? "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6, #ef4444)"
                      : "oklch(0.20 0.025 260)",
                  }}
                />
                <span className="hidden md:block text-sm truncate flex-1" style={{ color: isSelected ? "oklch(0.90 0.01 260)" : "oklch(0.65 0.02 260)" }}>
                  {wheel.name}
                </span>
                <span className="hidden md:block text-muted-foreground/50">
                  {wheel.isPublic ? <Globe size={12} /> : <Lock size={12} />}
                </span>
              </button>

              {/* Actions on hover */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                {wheel.isShared && isOwner && (
                  <button
                    onClick={(e) => { e.stopPropagation(); regenInvite.mutate({ id: wheel.id }); }}
                    className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    title="Share invite link"
                  >
                    <Share2 size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleExport(wheel.id, wheel.name); }}
                  className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  title="Export wheel"
                >
                  <Download size={12} />
                </button>
                {isOwner && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditWheel({ id: wheel.id, name: wheel.name, isShared: wheel.isShared, isPublic: wheel.isPublic, exclusionDays: wheel.exclusionDays, fairnessMode: wheel.fairnessMode, rotateCuisines: wheel.rotateCuisines });
                    }}
                    className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    title="Wheel settings"
                  >
                    <Settings size={12} />
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${wheel.name}"?`)) deleteWheel.mutate({ id: wheel.id }); }}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete wheel"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <button
          onClick={() => setShowCreate(true)}
          className="mx-2 flex items-center gap-2 px-2 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-150 mt-1"
        >
          <Plus size={16} className="flex-shrink-0" />
          <span className="hidden md:block text-sm">New Wheel</span>
        </button>

        <button
          onClick={() => { setImportText(""); setShowImport(true); }}
          className="mx-2 flex items-center gap-2 px-2 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-150"
        >
          <Upload size={16} className="flex-shrink-0" />
          <span className="hidden md:block text-sm">Import</span>
        </button>
      </aside>

      {/* Create wheel dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="glass border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>CREATE WHEEL</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <Input
              placeholder="Wheel name (e.g. Office Lunch)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && createWheel.mutate({ name: newName.trim(), isShared, isPublic, exclusionDays: parseInt(exclusionDays), fairnessMode, rotateCuisines })}
              className="bg-secondary/50 border-border/50"
            />
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Shared team wheel</Label>
              <Switch checked={isShared} onCheckedChange={setIsShared} />
            </div>
            {isShared && (
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Public (anyone with link)</Label>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Skip recently-spun for</Label>
              <Select value={exclusionDays} onValueChange={setExclusionDays}>
                <SelectTrigger size="sm" className="w-28 bg-secondary/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXCLUSION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Fairness mode</Label>
              <Switch checked={fairnessMode} onCheckedChange={setFairnessMode} />
            </div>
            {fairnessMode && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Spins lean toward restaurants you haven't picked in a while.
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Rotate cuisines</Label>
              <Switch checked={rotateCuisines} onCheckedChange={setRotateCuisines} />
            </div>
            {rotateCuisines && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Spins lean away from a cuisine you just had toward neglected ones.
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Add starter restaurants</Label>
              <Switch checked={addStarterPack} onCheckedChange={setAddStarterPack} />
            </div>
            <Button
              onClick={() => newName.trim() && createWheel.mutate({ name: newName.trim(), isShared, isPublic, exclusionDays: parseInt(exclusionDays), fairnessMode, rotateCuisines })}
              disabled={!newName.trim() || createWheel.isPending}
              style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))", color: "white" }}
            >
              {createWheel.isPending ? "Creating..." : "Create Wheel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite link dialog */}
      <Dialog open={!!showInvite} onOpenChange={() => setShowInvite(null)}>
        <DialogContent className="glass border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>INVITE LINK</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-sm text-muted-foreground">Share this link with your team to join <strong className="text-foreground">{showInvite?.name}</strong>:</p>
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="bg-secondary/50 border-border/50 text-xs" />
              <Button size="icon" variant="outline" onClick={copyInvite}>
                <Copy size={14} />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wheel settings dialog */}
      <Dialog open={!!editWheel} onOpenChange={(open) => { if (!open) setEditWheel(null); }}>
        <DialogContent className="glass border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>WHEEL SETTINGS</DialogTitle>
          </DialogHeader>
          {editWheel && (
            <div className="flex flex-col gap-4 pt-2">
              <Input
                placeholder="Wheel name"
                value={editWheel.name}
                onChange={(e) => setEditWheel({ ...editWheel, name: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
              {editWheel.isShared && (
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Public (anyone with link)</Label>
                  <Switch checked={editWheel.isPublic} onCheckedChange={(v) => setEditWheel({ ...editWheel, isPublic: v })} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Skip recently-spun for</Label>
                <Select value={String(editWheel.exclusionDays)} onValueChange={(v) => setEditWheel({ ...editWheel, exclusionDays: parseInt(v) })}>
                  <SelectTrigger size="sm" className="w-28 bg-secondary/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCLUSION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Fairness mode</Label>
                <Switch checked={editWheel.fairnessMode} onCheckedChange={(v) => setEditWheel({ ...editWheel, fairnessMode: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Rotate cuisines</Label>
                <Switch checked={editWheel.rotateCuisines} onCheckedChange={(v) => setEditWheel({ ...editWheel, rotateCuisines: v })} />
              </div>
              <Button
                onClick={() => editWheel.name.trim() && updateWheel.mutate({
                  id: editWheel.id,
                  name: editWheel.name.trim(),
                  isPublic: editWheel.isPublic,
                  exclusionDays: editWheel.exclusionDays,
                  fairnessMode: editWheel.fairnessMode,
                  rotateCuisines: editWheel.rotateCuisines,
                })}
                disabled={!editWheel.name.trim() || updateWheel.isPending}
                style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))", color: "white" }}
              >
                {updateWheel.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import wheel dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) { setShowImport(false); setImportText(""); } }}>
        <DialogContent className="glass border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>IMPORT WHEEL</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Paste a wheel export, or load a <code>.json</code> file. It's added as a new wheel you own.
            </p>
            <label className="self-start text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5">
              <Upload size={12} /> Choose file…
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); }}
              />
            </label>
            <Textarea
              placeholder='{ "name": "Office Lunch", "restaurants": [ … ] }'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="bg-secondary/50 border-border/50 resize-none font-mono text-xs"
              rows={8}
            />
            <Button
              onClick={submitImport}
              disabled={!importText.trim() || importWheel.isPending}
              style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))", color: "white" }}
            >
              {importWheel.isPending ? "Importing..." : "Import Wheel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
