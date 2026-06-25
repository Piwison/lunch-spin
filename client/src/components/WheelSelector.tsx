import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Plus, Globe, Lock, Trash2, Share2, Copy, Settings, Download, Upload, MoreVertical, Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ErrorChip } from "@/components/StatusChip";
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

/** Per-wheel actions, consolidated into one kebab menu so they can never overlap
 *  the row's select target (the old always-on icon cluster caused tap-hijack on
 *  mobile). Shared by the desktop rail and the mobile switcher sheet. */
function WheelActionsMenu({
  wheel,
  isOwner,
  large,
  onShare,
  onCopyPublic,
  onExport,
  onSettings,
  onDelete,
}: {
  wheel: { isShared: boolean; isPublic: boolean };
  isOwner: boolean;
  large?: boolean;
  onShare: () => void;
  onCopyPublic: () => void;
  onExport: () => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Wheel actions"
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors ${
            large ? "h-11 w-11" : "h-9 w-9"
          }`}
        >
          <MoreVertical size={large ? 18 : 16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass border-border/50 min-w-44">
        {/* Public wheels can be shared with anyone — no sign-in, no token. */}
        {wheel.isPublic && (
          <DropdownMenuItem onClick={onCopyPublic} className="gap-2.5">
            <Globe size={14} /> Copy public link
          </DropdownMenuItem>
        )}
        {wheel.isShared && isOwner && (
          <DropdownMenuItem onClick={onShare} className="gap-2.5">
            <Share2 size={14} /> Share invite link
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onExport} className="gap-2.5">
          <Download size={14} /> Export
        </DropdownMenuItem>
        {isOwner && (
          <DropdownMenuItem onClick={onSettings} className="gap-2.5">
            <Settings size={14} /> Settings
          </DropdownMenuItem>
        )}
        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive" className="gap-2.5">
              <Trash2 size={14} /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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
        setShowInvite({ wheelId: data.id, token: data.inviteToken, name: newName });
      }
      toast.success("Wheel created!");
    },
    onError: (e) => { setCreateError(e.message); },
  });
  const deleteWheel = trpc.wheels.delete.useMutation({
    onSuccess: () => { utils.wheels.list.invalidate(); toast.success("Wheel deleted"); },
    onError: (e) => toast.error(`Failed to delete wheel: ${e.message}`),
  });
  const regenInvite = trpc.wheels.regenerateInvite.useMutation({
    onSuccess: (data, vars) => {
      const w = wheels?.find(w => w.id === vars.id);
      setShowInvite({ wheelId: vars.id, token: data.inviteToken, name: w?.name ?? "" });
    },
    onError: (e) => toast.error(`Failed to regenerate invite: ${e.message}`),
  });
  const updateWheel = trpc.wheels.update.useMutation({
    onSuccess: () => {
      utils.wheels.list.invalidate();
      utils.wheels.get.invalidate();
      utils.restaurants.list.invalidate();
      setEditWheel(null);
      setUpdateError(null);
      toast.success("Wheel settings saved");
    },
    onError: (e) => { setUpdateError(e.message); },
  });

  const inviteUrl = showInvite ? `${window.location.origin}/join/${showInvite.token}` : "";

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied!");
  };

  const copyPublicLink = (wheelId: number) => {
    navigator.clipboard.writeText(`${window.location.origin}/w/${wheelId}`);
    toast.success("Public link copied!");
  };

  const selectedWheel = wheels?.find((w) => w.id === selectedWheelId);

  /** One row, shared between the desktop rail and the mobile sheet. The select
   *  target and the kebab are siblings (not nested), so a tap can only ever do
   *  one thing. */
  const renderRow = (wheel: NonNullable<typeof wheels>[number], variant: "rail" | "sheet") => {
    const isSelected = wheel.id === selectedWheelId;
    const isOwner = wheel.ownerId === user?.id;
    const inSheet = variant === "sheet";
    const select = () => {
      onSelect(wheel.id);
      if (inSheet) setShowSwitcher(false);
    };
    return (
      <div
        key={wheel.id}
        className="group relative flex items-center gap-1 rounded-xl transition-all duration-150"
        style={{
          background: isSelected ? "oklch(from var(--brand) l c h / 0.15)" : "transparent",
          border: isSelected ? "1px solid oklch(from var(--brand) l c h / 0.3)" : "1px solid transparent",
        }}
      >
        <button
          onClick={select}
          aria-current={isSelected}
          className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 rounded-xl text-left ${inSheet ? "min-h-[56px] py-2" : "py-2"}`}
        >
          <span
            className="w-6 h-6 rounded-full flex-shrink-0"
            style={{
              background: isSelected
                ? "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))"
                : "var(--border)",
            }}
          />
          <span
            className="flex-1 truncate text-sm"
            style={{ color: isSelected ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            {wheel.name}
          </span>
          {isSelected && inSheet && <Check size={16} style={{ color: "var(--brand)" }} className="flex-shrink-0" />}
          <span
            className="text-muted-foreground/50 flex-shrink-0"
            title={wheel.isPublic ? "Public — anyone with the link can view" : "Private — only you and invited members"}
          >
            {wheel.isPublic ? <Globe size={12} /> : <Lock size={12} />}
          </span>
        </button>
        <div
          className={`flex-shrink-0 pr-1 ${
            inSheet ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150"
          }`}
        >
          <WheelActionsMenu
            wheel={wheel}
            isOwner={isOwner}
            large={inSheet}
            onShare={() => regenInvite.mutate({ id: wheel.id })}
            onCopyPublic={() => copyPublicLink(wheel.id)}
            onExport={() => handleExport(wheel.id, wheel.name)}
            onSettings={() => setEditWheel({ id: wheel.id, name: wheel.name, isShared: wheel.isShared, isPublic: wheel.isPublic, exclusionDays: wheel.exclusionDays, fairnessMode: wheel.fairnessMode, rotateCuisines: wheel.rotateCuisines })}
            onDelete={() => { if (confirm(`Delete "${wheel.name}"?`)) deleteWheel.mutate({ id: wheel.id }); }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── DESKTOP RAIL — floating Liquid Glass panel ── */}
      <aside className="hidden md:flex w-56 flex-col gap-1 m-2 p-2 rounded-2xl glass-nav overflow-y-auto flex-shrink-0">
        <div className="px-2 pt-1 pb-2">
          <span className="text-xs font-semibold text-muted-foreground tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
            MY WHEELS
          </span>
        </div>

        {wheels?.map((wheel) => renderRow(wheel, "rail"))}

        <button
          onClick={() => setShowCreate(true)}
          className="mt-1 flex items-center gap-2 px-2.5 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-150"
        >
          <Plus size={16} className="flex-shrink-0" />
          <span className="text-sm">New Wheel</span>
        </button>
        <button
          onClick={() => { setImportText(""); setShowImport(true); }}
          className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-150"
        >
          <Upload size={16} className="flex-shrink-0" />
          <span className="text-sm">Import</span>
        </button>
      </aside>

      {/* ── MOBILE — wheel-picker pill + bottom sheet ── */}
      <div className="md:hidden px-3 pt-3 pb-1 flex-shrink-0">
        <Sheet open={showSwitcher} onOpenChange={setShowSwitcher}>
          <SheetTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-3.5 h-14 rounded-2xl glass-nav text-left transition-transform active:scale-[0.99]">
              <span
                className="w-7 h-7 rounded-full flex-shrink-0"
                style={{
                  background: selectedWheel
                    ? "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))"
                    : "var(--border)",
                }}
              />
              <span className="flex-1 truncate text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                {selectedWheel?.name ?? "Select a wheel"}
              </span>
              <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="glass-nav border-border/50 rounded-t-3xl max-h-[80vh] gap-0 px-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <SheetHeader className="flex-row items-center justify-between pl-1 pr-11 pb-1">
              <SheetTitle className="text-xs tracking-widest text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                MY WHEELS
              </SheetTitle>
              <button
                onClick={() => { setShowSwitcher(false); setShowCreate(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-foreground hover:bg-white/10 transition-colors"
              >
                <Plus size={14} /> New
              </button>
            </SheetHeader>
            <div className="flex flex-col gap-1 overflow-y-auto py-1">
              {wheels?.map((wheel) => renderRow(wheel, "sheet"))}
            </div>
            <button
              onClick={() => { setShowSwitcher(false); setImportText(""); setShowImport(true); }}
              className="mt-1 flex items-center gap-2 px-2.5 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-150"
            >
              <Upload size={16} className="flex-shrink-0" /> Import wheel
            </button>
          </SheetContent>
        </Sheet>
      </div>

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
            <ErrorChip error={createError} onDismiss={() => setCreateError(null)} />
            <Button
              onClick={() => { setCreateError(null); newName.trim() && createWheel.mutate({ name: newName.trim(), isShared, isPublic, exclusionDays: parseInt(exclusionDays), fairnessMode, rotateCuisines }); }}
              disabled={!newName.trim() || createWheel.isPending}
              className="relative overflow-hidden transition-all duration-200 active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
            >
              {createWheel.isPending ? (
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating...</span>
              ) : "Create Wheel"}
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
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Public (anyone with link can view &amp; spin)</Label>
                <Switch checked={editWheel.isPublic} onCheckedChange={(v) => setEditWheel({ ...editWheel, isPublic: v })} />
              </div>
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
              <ErrorChip error={updateError} onDismiss={() => setUpdateError(null)} />
              <Button
                onClick={() => { setUpdateError(null); editWheel.name.trim() && updateWheel.mutate({
                  id: editWheel.id,
                  name: editWheel.name.trim(),
                  isPublic: editWheel.isPublic,
                  exclusionDays: editWheel.exclusionDays,
                  fairnessMode: editWheel.fairnessMode,
                  rotateCuisines: editWheel.rotateCuisines,
                }); }}
                disabled={!editWheel.name.trim() || updateWheel.isPending}
                className="transition-all duration-200 active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
              >
                {updateWheel.isPending ? (
                  <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</span>
                ) : "Save Settings"}
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
            <label
              htmlFor="wheel-import-file"
              className="self-start text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5"
            >
              <Upload size={12} /> Choose file…
              <input
                id="wheel-import-file"
                aria-label="Import wheel from JSON file"
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
              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
            >
              {importWheel.isPending ? "Importing..." : "Import Wheel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
