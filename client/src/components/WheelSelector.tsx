import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Plus, Globe, Lock, Trash2, Share2, Copy, Settings, Download, Upload, MoreVertical, Check, ChevronDown, Star, MapPin, Navigation, Users } from "lucide-react";
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
  /**
   * Lets a parent (e.g. WheelApp's first-run card) open the create dialog. The
   * registered opener takes the desired starter-pack state: `true` = "start from a
   * sample" (adds STARTER_RESTAURANTS), `false` = blank wheel.
   */
  registerCreateOpener?: (open: (withStarter: boolean) => void) => void;
  /**
   * Lets a parent (the Wheel tab's gear icon) open the settings dialog for a
   * given wheel without duplicating its form state/mutations — same pattern
   * as registerCreateOpener above.
   */
  registerSettingsOpener?: (open: (wheelId: number) => void) => void;
}

/** Loose check: does this string look like a Google Maps link worth resolving? */
const looksLikeMapLink = (s: string) =>
  /(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/)/i.test(s.trim());

const EXCLUSION_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
];

/** The preset options, plus the wheel's current value if it isn't a preset
 *  (possible via import, which allows any 0–30) — otherwise the settings
 *  select renders blank. */
function exclusionOptionsFor(current: number) {
  if (EXCLUSION_OPTIONS.some((o) => o.value === String(current))) return EXCLUSION_OPTIONS;
  return [...EXCLUSION_OPTIONS, { value: String(current), label: `${current} days` }].sort(
    (a, b) => parseInt(a.value) - parseInt(b.value),
  );
}

/** Per-wheel actions, consolidated into one kebab menu so they can never overlap
 *  the row's select target (the old always-on icon cluster caused tap-hijack on
 *  mobile). Shared by the desktop rail and the mobile switcher sheet. */
/** Group heading inside the settings dialog — turns one long flat list of
 *  controls into scannable sections (Basics / Sharing / Spin rules / Distance). */
function SettingsSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground/70 pt-1 first:pt-0">
      {children}
    </div>
  );
}

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

export default function WheelSelector({ selectedWheelId, onSelect, registerCreateOpener, registerSettingsOpener }: WheelSelectorProps) {
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
  const [editWheel, setEditWheel] = useState<{
    id: number;
    name: string;
    isShared: boolean;
    isPublic: boolean;
    exclusionDays: number;
    fairnessMode: boolean;
    rotateCuisines: boolean;
    distanceEnabled: boolean;
    originLabel: string;
    originLat: number | null;
    originLng: number | null;
  } | null>(null);
  const [originLinkInput, setOriginLinkInput] = useState("");
  const [locatingOrigin, setLocatingOrigin] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
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

  // Default the starter pack on for a user's very first wheel only. Skip while the
  // create dialog is open so a wheels.list refetch (e.g. window refocus) can't
  // silently clobber the user's explicit toggle / the imperative opener's choice.
  useEffect(() => {
    if (wheels && !showCreate) setAddStarterPack(wheels.length === 0);
  }, [wheels, showCreate]);

  // Expose an imperative opener so the first-run card can launch the create dialog
  // with the starter-pack toggle pre-set (sample vs blank). setState setters are
  // stable, so this registers once.
  useEffect(() => {
    registerCreateOpener?.((withStarter: boolean) => {
      setAddStarterPack(withStarter);
      setCreateError(null);
      setShowCreate(true);
    });
  }, [registerCreateOpener]);

  // Shared by the kebab menu's "Settings" item and the Wheel tab's gear icon
  // (registerSettingsOpener below) so both entry points seed the exact same
  // form state — no duplicated logic to drift out of sync.
  const openSettingsFor = (wheel: NonNullable<typeof wheels>[number]) => {
    setOriginLinkInput("");
    setOriginError(null);
    setEditWheel({
      id: wheel.id,
      name: wheel.name,
      isShared: wheel.isShared,
      isPublic: wheel.isPublic,
      exclusionDays: wheel.exclusionDays,
      fairnessMode: wheel.fairnessMode,
      rotateCuisines: wheel.rotateCuisines,
      distanceEnabled: wheel.distanceEnabled,
      originLabel: wheel.originLabel ?? "Office",
      originLat: wheel.originLat == null ? null : Number(wheel.originLat),
      originLng: wheel.originLng == null ? null : Number(wheel.originLng),
    });
  };

  // Expose an imperative opener so the Wheel tab's gear icon can launch
  // settings for the currently-selected wheel without duplicating its state.
  useEffect(() => {
    registerSettingsOpener?.((wheelId: number) => {
      const wheel = wheels?.find((w) => w.id === wheelId);
      if (wheel) openSettingsFor(wheel);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSettingsOpener, wheels]);

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
    onSuccess: (_data, vars) => {
      utils.wheels.list.invalidate();
      // Refetching the deleted wheel 404s, which tells WheelApp to drop the
      // selection instead of sitting on a dead wheel.
      utils.wheels.get.invalidate({ id: vars.id });
      toast.success("Wheel deleted");
    },
    onError: (e) => toast.error(`Failed to delete wheel: ${e.message}`),
  });
  const setDefaultWheel = trpc.wheels.setDefault.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); },
    onError: (e) => toast.error(`Failed to set default wheel: ${e.message}`),
  });
  const regenInvite = trpc.wheels.regenerateInvite.useMutation({
    onSuccess: (data, vars) => {
      const w = wheels?.find(w => w.id === vars.id);
      // Refresh the list so the new token flows back into the settings dialog's
      // in-place invite link (it reads wheel.inviteToken from this query).
      utils.wheels.list.invalidate();
      setShowInvite({ wheelId: vars.id, token: data.inviteToken, name: w?.name ?? "" });
    },
    onError: (e) => toast.error(`Failed to regenerate invite: ${e.message}`),
  });
  // Settings + distance mode used to be two independent save buttons in one
  // dialog. That was a trap: "Save Settings" (the first, more prominent
  // button) closed the dialog and reported success without ever sending the
  // just-looked-up origin to the server — it only ever lived in local form
  // state, so it silently vanished the next time settings were reopened.
  // Fixed by unifying into one save action (below) that submits both.
  const updateWheel = trpc.wheels.update.useMutation({
    onError: (e) => { setUpdateError(e.message); },
  });
  const resolveOriginLink = trpc.places.resolveLink.useMutation({
    onSuccess: ({ place }) => {
      // Unlike a restaurant's "Look up" (name-only, coordinates optional), the
      // origin is USELESS without coordinates — Google's response can carry a
      // name with no geometry (e.g. some establishment results). Reporting
      // success here when there's nothing to save is exactly what produced the
      // "I saved it but it's gone" confusion: the origin was never captured, so
      // the later Save Settings step correctly rejected it, but by then the
      // misleading toast had already made it look like this step had worked.
      if (place.lat == null || place.lng == null) {
        setOriginError(`Found "${place.name}" but couldn't get its exact location. Try "Use my current location" instead, or a more specific Maps link.`);
        return;
      }
      setOriginError(null);
      setOriginLinkInput("");
      if (editWheel) setEditWheel({ ...editWheel, originLat: place.lat, originLng: place.lng });
      toast.success(`Found: ${place.name}`);
    },
    onError: (e) => setOriginError(e.message),
  });
  const setDistanceOrigin = trpc.wheels.setDistanceOrigin.useMutation({
    onError: (e) => setOriginError(e.message),
  });
  const savingWheelSettings = updateWheel.isPending || setDistanceOrigin.isPending;

  const saveWheelSettings = async () => {
    if (!editWheel || !editWheel.name.trim()) return;
    setUpdateError(null);
    setOriginError(null);
    if (editWheel.distanceEnabled && (editWheel.originLat == null || editWheel.originLng == null)) {
      setOriginError("Set an origin location first.");
      return;
    }
    // Sharing was OFF before this save — if this save turns it on, the response
    // tells us to pop the INVITE LINK dialog right away instead of leaving the
    // link buried in Settings for the owner to dig up on a second visit.
    const wasSharedBefore = wheels?.find((w) => w.id === editWheel.id)?.isShared === true;
    const turningSharingOn = editWheel.isShared && !wasSharedBefore;
    try {
      const [updateRes, distanceRes] = await Promise.all([
        updateWheel.mutateAsync({
          id: editWheel.id,
          name: editWheel.name.trim(),
          isPublic: editWheel.isPublic,
          isShared: editWheel.isShared,
          exclusionDays: editWheel.exclusionDays,
          fairnessMode: editWheel.fairnessMode,
          rotateCuisines: editWheel.rotateCuisines,
        }),
        setDistanceOrigin.mutateAsync({
          id: editWheel.id,
          enabled: editWheel.distanceEnabled,
          originLat: editWheel.originLat,
          originLng: editWheel.originLng,
          originLabel: editWheel.originLabel.trim() || "Office",
        }),
      ]);
      utils.wheels.list.invalidate();
      utils.wheels.get.invalidate();
      utils.restaurants.list.invalidate();
      const savedName = editWheel.name.trim();
      const savedId = editWheel.id;
      setEditWheel(null);
      if (turningSharingOn && updateRes.inviteToken) {
        setShowInvite({ wheelId: savedId, token: updateRes.inviteToken, name: savedName });
      }
      // The settings themselves saved fine even if the distance computation
      // failed — that's a separate, retriable step (Restaurants tab's
      // Recompute button), so still close the dialog, just warn instead of
      // claiming success on the part that didn't work.
      if (editWheel.distanceEnabled && distanceRes.matrixFailed) {
        toast.error("Settings saved, but couldn't reach the Distance Matrix service — check it's enabled on the server's Google Maps API key.");
      } else {
        toast.success(
          editWheel.distanceEnabled && (distanceRes.computed || distanceRes.unlocatable)
            ? `Wheel settings saved — ${distanceRes.computed} located${distanceRes.unlocatable ? `, ${distanceRes.unlocatable} skipped` : ""}`
            : "Wheel settings saved",
        );
      }
    } catch {
      // The failing mutation's own onError already set the inline message
      // (updateError or originError) — dialog stays open, nothing is lost.
    }
  };

  const locateOrigin = () => {
    if (!editWheel) return;
    setOriginError(null);
    if (!("geolocation" in navigator)) {
      setOriginError("This device can't share its location.");
      return;
    }
    setLocatingOrigin(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingOrigin(false);
        setEditWheel({ ...editWheel, originLat: pos.coords.latitude, originLng: pos.coords.longitude });
      },
      (err) => {
        setLocatingOrigin(false);
        setOriginError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied."
            : "Couldn't get your location. Try again.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const inviteUrl = showInvite ? `${window.location.origin}/join/${showInvite.token}` : "";

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied!");
  };

  const publicLinkFor = (wheelId: number) => `${window.location.origin}/w/${wheelId}`;
  const inviteLinkFor = (token: string) => `${window.location.origin}/join/${token}`;

  const copyLink = (url: string, copiedMsg: string) => {
    navigator.clipboard.writeText(url);
    toast.success(copiedMsg);
  };
  const copyPublicLink = (wheelId: number) => copyLink(publicLinkFor(wheelId), "Public link copied!");

  // Native share sheet on devices that support it (a phone's real "Share to…"),
  // falling back to a plain copy on desktop. A cancelled share throws, so we
  // swallow it rather than treating it as a failure to copy.
  const shareLink = async (url: string, title: string, text: string, copiedMsg: string) => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* user dismissed the share sheet — nothing to do */
      }
      return;
    }
    copyLink(url, copiedMsg);
  };
  const sharePublicLink = (wheelId: number, wheelName: string) =>
    shareLink(publicLinkFor(wheelId), wheelName, `Spin the wheel: ${wheelName}`, "Public link copied!");
  const shareInviteLink = (token: string, wheelName: string) =>
    shareLink(inviteLinkFor(token), wheelName, `Join the lunch wheel: ${wheelName}`, "Invite link copied!");

  const selectedWheel = wheels?.find((w) => w.id === selectedWheelId);
  const isSelectedWheelOwner = selectedWheel?.ownerId === user?.id;

  /** One row, shared between the desktop rail and the mobile sheet. The select
   *  target and the kebab are siblings (not nested), so a tap can only ever do
   *  one thing. */
  const renderRow = (wheel: NonNullable<typeof wheels>[number], variant: "rail" | "sheet") => {
    const isSelected = wheel.id === selectedWheelId;
    const isOwner = wheel.ownerId === user?.id;
    const isDefault = wheel.id === user?.defaultWheelId;
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
            className={`w-6 h-6 rounded-full flex-shrink-0 ${isSelected ? "orb-wheel" : ""}`}
            style={isSelected ? undefined : { background: "var(--border)" }}
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
        <button
          onClick={(e) => { e.stopPropagation(); setDefaultWheel.mutate({ wheelId: isDefault ? null : wheel.id }); }}
          disabled={setDefaultWheel.isPending}
          aria-label={isDefault ? "Unset default wheel" : "Set as default wheel"}
          title={isDefault ? "Default wheel — opens automatically. Click to unset." : "Set as default wheel (opens automatically on entry)"}
          className={`flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors ${inSheet ? "h-11 w-9" : "h-9 w-8"}`}
        >
          <Star size={14} style={{ color: isDefault ? "var(--brand)" : "var(--muted-foreground)" }} fill={isDefault ? "var(--brand)" : "none"} />
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
            onSettings={() => openSettingsFor(wheel)}
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
      </aside>

      {/* ── MOBILE — wheel-picker pill + bottom sheet ── */}
      <div className="md:hidden px-3 pt-3 pb-1 flex-shrink-0 flex items-center gap-2">
        <Sheet open={showSwitcher} onOpenChange={setShowSwitcher}>
          <SheetTrigger asChild>
            <button className="flex-1 min-w-0 flex items-center gap-2.5 px-3.5 h-14 rounded-2xl glass-nav text-left transition-transform active:scale-[0.99]">
              <span
                className={`w-7 h-7 rounded-full flex-shrink-0 ${selectedWheel ? "orb-wheel" : ""}`}
                style={selectedWheel ? undefined : { background: "var(--border)" }}
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
          </SheetContent>
        </Sheet>
        {isSelectedWheelOwner && selectedWheel && (
          <button
            onClick={() => openSettingsFor(selectedWheel)}
            aria-label="Wheel settings"
            title="Wheel settings"
            className="flex-shrink-0 flex items-center justify-center h-14 w-14 rounded-2xl glass-nav text-muted-foreground hover:text-foreground transition-transform active:scale-95"
          >
            <Settings size={18} />
          </button>
        )}
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
        {/* This dialog is the app's longest, and on a phone it used to overflow the
            viewport with Save stranded off-screen. It now owns its own layout: a
            pinned title, a single scrolling body, and a pinned footer so Save is
            always reachable no matter how many sections are expanded. (p-0 +
            flex-col overrides DialogContent's default grid/padding.) */}
        <DialogContent className="glass border-border/50 max-w-sm p-0 gap-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>WHEEL SETTINGS</DialogTitle>
          </DialogHeader>
          {editWheel && (
            /* A BLOCK with space-y — deliberately not `flex flex-col gap-4`. As a
               flex column its children (flex-shrink defaults to 1, and index.css's
               unlayered `.flex{min-height:0}` removes the auto min-height floor)
               got squashed below their content height once the body overflowed, so
               the origin input, the locate button and the status lines rendered on
               top of each other. */
            <div className="space-y-4 px-5 pb-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
              <SettingsSection>Basics</SettingsSection>
              <Input
                placeholder="Wheel name"
                value={editWheel.name}
                onChange={(e) => setEditWheel({ ...editWheel, name: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
              <SettingsSection>Sharing</SettingsSection>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Shared team wheel</Label>
                <Switch checked={editWheel.isShared} onCheckedChange={(v) => setEditWheel({ ...editWheel, isShared: v })} />
              </div>
              {editWheel.isShared && (() => {
                // Team invite link for members to join. Sharing itself has to be
                // persisted before the server will issue/regenerate a token (it
                // 403s a not-yet-shared wheel), so if isShared was only just
                // toggled on this session, prompt to save instead of showing a
                // button that would fail — saving pops the INVITE LINK dialog
                // automatically in that case (see saveWheelSettings), so this
                // in-place block mainly matters when reopening settings later.
                const persisted = wheels?.find((w) => w.id === editWheel.id);
                const sharedLive = persisted?.isShared === true;
                const token = persisted?.inviteToken ?? null;
                const regenerate = () => { const id = editWheel.id; setEditWheel(null); regenInvite.mutate({ id }); };
                return (
                  <div className="-mt-1 flex flex-col gap-2 rounded-lg border border-border/40 bg-secondary/30 p-3">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users size={14} className="flex-shrink-0" /> Team invite
                    </div>
                    {!sharedLive ? (
                      <p className="text-[11px] text-muted-foreground">Press Save Settings to turn on sharing — you'll get an invite link right away.</p>
                    ) : token ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={inviteLinkFor(token)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-9 bg-background/60 border-border/50 text-xs font-mono"
                          />
                          <Button size="icon" variant="outline" className="h-9 w-9 flex-shrink-0" title="Copy invite link" onClick={() => copyLink(inviteLinkFor(token), "Invite link copied!")}>
                            <Copy size={14} />
                          </Button>
                          <Button size="icon" variant="outline" className="h-9 w-9 flex-shrink-0" title="Share invite" onClick={() => shareInviteLink(token, editWheel.name)}>
                            <Share2 size={14} />
                          </Button>
                        </div>
                        <button type="button" onClick={regenerate} className="self-start text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                          Regenerate link (invalidates the old one)
                        </button>
                        <p className="text-[11px] text-muted-foreground">Anyone with this link can sign in and join the team.</p>
                      </>
                    ) : (
                      <>
                        <Button type="button" variant="outline" size="sm" className="self-start gap-2" onClick={regenerate}>
                          <Share2 size={14} /> Generate invite link
                        </Button>
                        <p className="text-[11px] text-muted-foreground">Anyone with this link can sign in and join the team.</p>
                      </>
                    )}
                  </div>
                );
              })()}
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Public (anyone with link can view &amp; spin)</Label>
                <Switch checked={editWheel.isPublic} onCheckedChange={(v) => setEditWheel({ ...editWheel, isPublic: v })} />
              </div>
              {editWheel.isPublic && (() => {
                // The link is live only once isPublic is persisted; if it was just
                // toggled on this session, say so instead of implying it already works.
                const live = wheels?.find((w) => w.id === editWheel.id)?.isPublic === true;
                const publicUrl = `${window.location.origin}/w/${editWheel.id}`;
                return (
                  <div className="-mt-1 flex flex-col gap-2 rounded-lg border border-border/40 bg-secondary/30 p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={publicUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-9 bg-background/60 border-border/50 text-xs font-mono"
                      />
                      <Button size="icon" variant="outline" className="h-9 w-9 flex-shrink-0" title="Copy link" onClick={() => copyPublicLink(editWheel.id)}>
                        <Copy size={14} />
                      </Button>
                      <Button size="icon" variant="outline" className="h-9 w-9 flex-shrink-0" title="Share" onClick={() => sharePublicLink(editWheel.id, editWheel.name)}>
                        <Share2 size={14} />
                      </Button>
                    </div>
                    <p className={`text-[11px] flex items-center gap-1.5 ${live ? "" : "text-muted-foreground"}`} style={live ? { color: "var(--ok)" } : undefined}>
                      <Globe size={12} className="flex-shrink-0" />
                      {live ? "Live — anyone with this link can view & spin." : "Turns live when you press Save Settings."}
                    </p>
                  </div>
                );
              })()}
              <SettingsSection>Spin rules</SettingsSection>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Skip recently-spun for</Label>
                <Select value={String(editWheel.exclusionDays)} onValueChange={(v) => setEditWheel({ ...editWheel, exclusionDays: parseInt(v) })}>
                  <SelectTrigger size="sm" className="w-28 bg-secondary/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {exclusionOptionsFor(editWheel.exclusionDays).map((opt) => (
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

              <SettingsSection>Distance</SettingsSection>
              {/* Distance mode — its origin (paste a link / geolocate) is resolved
                  into local state here and only actually persisted by the single
                  save button below, together with everything else in this dialog. */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Distance mode</Label>
                  <Switch
                    checked={editWheel.distanceEnabled}
                    onCheckedChange={(v) => setEditWheel({ ...editWheel, distanceEnabled: v })}
                  />
                </div>
                {editWheel.distanceEnabled && (
                  <>
                    <p className="-mt-1 text-xs text-muted-foreground">
                      Shows walking time from one point to every restaurant.
                      {editWheel.isShared ? " Shared wheels use a single office/meeting point, visible to the team." : ""}
                    </p>
                    <Input
                      placeholder="Label (e.g. Office)"
                      value={editWheel.originLabel}
                      onChange={(e) => setEditWheel({ ...editWheel, originLabel: e.target.value })}
                      className="bg-secondary/50 border-border/50"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        inputMode="url"
                        placeholder="Paste a Google Maps link"
                        value={originLinkInput}
                        onChange={(e) => setOriginLinkInput(e.target.value)}
                        className="bg-secondary/50 border-border/50"
                      />
                      <Button
                        type="button"
                        onClick={() => { setOriginError(null); resolveOriginLink.mutate({ wheelId: editWheel.id, url: originLinkInput.trim() }); }}
                        disabled={!looksLikeMapLink(originLinkInput) || resolveOriginLink.isPending}
                        className="flex-shrink-0"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                      >
                        {resolveOriginLink.isPending
                          ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          : "Look up"}
                      </Button>
                    </div>
                    <Button type="button" variant="outline" onClick={locateOrigin} disabled={locatingOrigin} className="gap-2">
                      <Navigation size={14} /> {locatingOrigin ? "Locating…" : "Use my current location"}
                    </Button>
                    {(() => {
                      // Distinguish an origin already persisted in the DB (loaded
                      // on open — reassures the owner it really did save last time)
                      // from one just set this session and still pending Save. The
                      // old copy said "saved when you save settings below" for both,
                      // which read as "not saved yet" even for a stored origin.
                      const saved = wheels?.find((w) => w.id === editWheel.id);
                      const savedLat = saved?.originLat != null ? Number(saved.originLat) : null;
                      const savedLng = saved?.originLng != null ? Number(saved.originLng) : null;
                      const hasOrigin = editWheel.originLat != null && editWheel.originLng != null;
                      if (!hasOrigin) {
                        return (
                          <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
                            <MapPin size={12} className="flex-shrink-0" />
                            No location set yet — paste a link or use your location
                          </p>
                        );
                      }
                      const isPersisted = editWheel.originLat === savedLat && editWheel.originLng === savedLng;
                      const mapHref = `https://www.google.com/maps/search/?api=1&query=${editWheel.originLat},${editWheel.originLng}`;
                      return (
                        <div className="flex flex-col gap-0.5">
                          <p className="text-xs flex items-center flex-wrap gap-x-1.5 gap-y-0.5" style={{ color: "var(--ok)" }}>
                            <MapPin size={12} className="flex-shrink-0" />
                            {isPersisted
                              ? `${editWheel.originLabel.trim() || "Office"} location saved`
                              : "New location ready — press Save Settings to apply"}
                            <a href={mapHref} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline" style={{ color: "var(--ok)" }}>
                              view on map
                            </a>
                          </p>
                          <p className="text-[11px] text-muted-foreground">Paste a new link or use your location to change it.</p>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

            </div>
          )}
          {/* Pinned footer — outside the scroll area, so Save (and any error) is
              visible whatever the body is scrolled to. */}
          {editWheel && (
            <div
              className="flex flex-col gap-2 px-5 py-4 flex-shrink-0"
              style={{ borderTop: "1px solid var(--border)", background: "var(--glass-opaque)" }}
            >
              <ErrorChip error={updateError} onDismiss={() => setUpdateError(null)} />
              <ErrorChip error={originError} onDismiss={() => setOriginError(null)} />
              <Button
                onClick={saveWheelSettings}
                disabled={!editWheel.name.trim() || savingWheelSettings}
                className="w-full transition-all duration-200 active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
              >
                {savingWheelSettings ? (
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
