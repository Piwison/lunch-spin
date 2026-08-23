import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Plus, Globe, Lock, LogOut, Trash2, Share2, Copy, CopyPlus, Settings, MoreVertical, Check, ChevronDown, Star, MapPin, Users, Eye } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ErrorChip } from "@/components/StatusChip";
import ConfirmDangerDialog from "@/components/ConfirmDangerDialog";
import LocationPicker from "@/components/LocationPicker";
import { STARTER_RESTAURANTS } from "@shared/starter";

interface WheelSelectorProps {
  selectedWheelId: number | null;
  onSelect: (id: number) => void;
  /**
   * A wheel was deleted from here. The parent owns `selectedWheelId`, so it —
   * not this component — decides where to go next. Without this the only signal
   * was the deleted wheel's own query starting to 404, which reads to the parent
   * as a broken link and greets a deliberate delete with "that wheel isn't
   * available anymore".
   */
  onDeleted: (id: number) => void;
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
  /**
   * Replaces the settings gear in the picker row.
   *
   * The Wheel tab puts the filter here instead. Settings is still one tap away
   * from the switcher sheet's per-wheel ⋮, and the gear is still in this row on
   * Places and History — but on the Wheel tab the row is prime real estate and
   * a filter you actually use beats a gear you rarely do.
   */
  trailing?: React.ReactNode;
}

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
    <div className="type-eyebrow pt-2 first:pt-0" style={{ color: "var(--brand-text)" }}>
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
  onCopyWheel,
  onSettings,
  onDelete,
  onLeave,
}: {
  wheel: { isShared: boolean; isPublic: boolean };
  isOwner: boolean;
  large?: boolean;
  onShare: () => void;
  onCopyPublic: () => void;
  onCopyWheel: () => void;
  onSettings: () => void;
  onDelete: () => void;
  onLeave: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Wheel actions"
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors ${
            large ? "h-14 w-12" : "h-11 w-11"
          }`}
        >
          <MoreVertical size={large ? 18 : 16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-card min-w-44">
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
        <DropdownMenuItem onClick={onCopyWheel} className="gap-2.5">
          <CopyPlus size={14} /> Copy wheel
        </DropdownMenuItem>
        {/* Members get Settings too — read-only inside (see `canEdit`), so a
            teammate can see the office and the spin rules without being able to
            change them. */}
        <DropdownMenuItem onClick={onSettings} className="gap-2.5">
          <Settings size={14} /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* The owner's exit is Delete and a member's is Leave — never both, and
            never neither. There is no ownership transfer in this app, so an
            owner who left would strand the team on a wheel nobody can
            administer; the server refuses it too. */}
        {isOwner ? (
          <DropdownMenuItem onClick={onDelete} variant="destructive" className="gap-2.5">
            <Trash2 size={14} /> Delete
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onLeave} variant="destructive" className="gap-2.5">
            <LogOut size={14} /> Leave wheel
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function WheelSelector({
  selectedWheelId,
  onSelect,
  onDeleted,
  registerCreateOpener,
  registerSettingsOpener,
  trailing,
}: WheelSelectorProps) {
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
  /** Expanded origin editor. Collapsed by default once an office is stored, so
   *  a wheel that already HAS one shows it instead of blank inputs. */
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  /** The wheel awaiting a delete confirmation. Held here rather than inside the
   *  kebab menu so the confirmation outlives the menu that launched it. */
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  /** The wheel a member is about to leave. Same shape and same reasoning as
      `confirmDelete`: held here, not in the row, so the dialog survives the row
      unmounting when the list refetches. */
  const [confirmLeave, setConfirmLeave] = useState<{ id: number; name: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: wheels } = trpc.wheels.list.useQuery();

  /**
   * Duplicate a wheel — "same restaurants, different team". Server-side row
   * copy (wheels.copy), not the lossy export JSON: that format drops place
   * ids, coordinates and cached opening hours, which would then cost a Place
   * Details call per restaurant to rebuild.
   */
  const copyWheel = trpc.wheels.copy.useMutation({
    onSuccess: (data) => {
      utils.wheels.list.invalidate();
      utils.wheels.bootstrap.invalidate();
      onSelect(data.id);
      setShowSwitcher(false);
      toast.success(`Copied to "${data.name}" — rename it in Settings`);
    },
    onError: (e) => toast.error(e.message),
  });

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
    setOriginError(null);
    // Collapsed when the wheel already has an office; expanded when it doesn't,
    // because then there is genuinely something to fill in.
    setEditingOrigin(wheel.originLat == null || wheel.originLng == null);
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
      // Tell the parent FIRST, so it drops the selection before anything can
      // refetch the wheel we just deleted. Doing it the other way round meant
      // the app learned about its own delete from a 404 and announced it as a
      // broken link.
      onDeleted(vars.id);
      utils.wheels.list.invalidate();
      // The entry payload was resolved before this delete and can still name the
      // wheel we just removed; refetch it so the app opens a surviving wheel
      // instead of being ejected off a dead one it was just handed.
      utils.wheels.bootstrap.invalidate();
      // The deleted wheel's own `wheels.get` entry is deliberately NOT touched.
      // onDeleted has already disabled that query, but React hasn't re-rendered
      // yet, so both invalidate() and reset() would catch it while it is still
      // active and fire one last request at a wheel we know is gone (a 404 in
      // the console on every delete). Left alone it simply goes inactive and is
      // garbage-collected; auto-increment ids are never reused, so nothing will
      // ever read it again.
      setConfirmDelete(null);
      setEditWheel(null);
      toast.success("Wheel deleted");
    },
    onError: (e) => toast.error(`Failed to delete wheel: ${e.message}`),
  });
  const leaveWheel = trpc.wheels.leave.useMutation({
    onSuccess: (_data, vars) => {
      // Same ordering as delete, for the same reason: tell the parent before
      // anything can refetch a wheel this user can no longer read, or the app
      // learns about its own departure from a 403.
      onDeleted(vars.id);
      utils.wheels.list.invalidate();
      utils.wheels.bootstrap.invalidate();
      // Leaving clears a starred default that pointed here, so the identity
      // payload that carries it is stale.
      utils.auth.me.invalidate();
      setConfirmLeave(null);
      toast.success("You left the wheel");
    },
    onError: (e) => toast.error(`Failed to leave wheel: ${e.message}`),
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

  /** Members can OPEN wheel settings but not change anything: the office and the
   *  spin rules are things a teammate needs to be able to see, while renaming,
   *  sharing and deleting stay with the owner. Every control below is disabled
   *  on this flag and the Save button is replaced by a note. */
  const canEdit = editWheel != null && wheels?.find((w) => w.id === editWheel.id)?.ownerId === user?.id;

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
        className="group relative flex items-center gap-1 transition-colors duration-150"
        style={{
          borderRadius: "var(--radius-control)",
          background: isSelected ? "oklch(from var(--brand) l c h / 0.15)" : "transparent",
          border: isSelected ? "1px solid oklch(from var(--brand) l c h / 0.3)" : "1px solid transparent",
        }}
      >
        <button
          onClick={select}
          aria-current={isSelected}
          className="flex-1 min-w-0 flex items-center gap-2.5 px-3 text-left"
          style={{ minHeight: 56, borderRadius: "var(--radius-control)" }}
        >
          <span
            className={`w-6 h-6 rounded-full flex-shrink-0 ${isSelected ? "orb-wheel" : ""}`}
            style={isSelected ? undefined : { background: "var(--border)" }}
          />
          <span
            className="flex-1 truncate"
            style={{ fontSize: 15, fontWeight: 500, color: isSelected ? "var(--ink-warm)" : "var(--body-warm)" }}
          >
            {wheel.name}
          </span>
          {isSelected && inSheet && <Check size={16} style={{ color: "var(--brand-text)" }} className="flex-shrink-0" />}
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
          className={`flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors ${inSheet ? "h-14 w-11" : "h-11 w-11"}`}
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
            onCopyWheel={() => copyWheel.mutate({ id: wheel.id })}
            onSettings={() => openSettingsFor(wheel)}
            onDelete={() => setConfirmDelete({ id: wheel.id, name: wheel.name })}
            onLeave={() => setConfirmLeave({ id: wheel.id, name: wheel.name })}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ── DESKTOP RAIL — floating Liquid Glass panel ── */}
      {/* Ember item 14: the rail is an xl-and-up affordance. Between 768 and
          1279 the tablet layout spends that width on the wheel column and the
          380px tab column instead, and the switcher falls back to the pill +
          sheet below — a 240px rail plus 380px of tab content leaves 148px for
          the wheel at 768. */}
      <aside
        className="hidden xl:flex w-60 flex-col gap-1 m-2 p-2 glass-bar overflow-y-auto flex-shrink-0"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <div className="px-3 pt-2 pb-3">
          <span className="type-eyebrow" style={{ color: "var(--brand-text)" }}>
            My wheels
          </span>
        </div>

        {wheels?.map((wheel) => renderRow(wheel, "rail"))}

        <button
          onClick={() => setShowCreate(true)}
          className="mt-1 flex items-center gap-2.5 px-3 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors duration-150"
          style={{ minHeight: 56, borderRadius: "var(--radius-control)" }}
        >
          <Plus size={17} className="flex-shrink-0" />
          <span style={{ fontSize: 15, fontWeight: 500 }}>New wheel</span>
        </button>
      </aside>

      {/* ── MOBILE — wheel-picker pill + bottom sheet ── */}
      <div className="xl:hidden px-3 pt-3 pb-1 flex-shrink-0 flex items-center gap-2">
        <Sheet open={showSwitcher} onOpenChange={setShowSwitcher}>
          <SheetTrigger asChild>
            <button
              className="flex-1 min-w-0 flex items-center gap-2.5 px-4 glass-bar text-left transition-transform active:scale-[var(--press-scale)]"
              style={{ minHeight: 56, borderRadius: "var(--radius-control)" }}
            >
              <span
                className={`w-7 h-7 rounded-full flex-shrink-0 ${selectedWheel ? "orb-wheel" : ""}`}
                style={selectedWheel ? undefined : { background: "var(--border)" }}
              />
              <span className="flex-1 truncate" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-warm)" }}>
                {selectedWheel?.name ?? "Select a wheel"}
              </span>
              <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="glass-sheet max-h-[80vh] gap-0 px-3"
            /* Bottom sheet: square off the edge that meets the viewport floor so
               only the top corners carry the sheet radius. */
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            }}
          >
            <SheetHeader className="flex-row items-center justify-between pl-2 pr-12 pb-1">
              <SheetTitle className="type-eyebrow" style={{ color: "var(--brand-text)" }}>
                My wheels
              </SheetTitle>
              <button
                onClick={() => { setShowSwitcher(false); setShowCreate(true); }}
                className="flex items-center gap-1.5 px-4 hover:bg-white/10 transition-colors"
                style={{ minHeight: 56, borderRadius: "var(--radius-control)", fontSize: 15, fontWeight: 500, color: "var(--ink-warm)" }}
              >
                <Plus size={16} /> New
              </button>
            </SheetHeader>
            <div className="flex flex-col gap-1 overflow-y-auto py-1">
              {wheels?.map((wheel) => renderRow(wheel, "sheet"))}
            </div>
          </SheetContent>
        </Sheet>
        {/* Shown to members too, not just the owner: the office and the spin
            rules are things a teammate needs to be able to look up. Everything
            inside is read-only for them (see `canEdit`), and the dialog says so
            at the top. */}
        {trailing ??
          (selectedWheel && (
            <button
              onClick={() => openSettingsFor(selectedWheel)}
              aria-label="Wheel settings"
              title={isSelectedWheelOwner ? "Wheel settings" : "Wheel settings (view only)"}
              className="flex-shrink-0 flex items-center justify-center glass-bar text-muted-foreground hover:text-foreground transition-transform active:scale-[var(--press-scale)]"
              style={{ minHeight: 56, minWidth: 56, borderRadius: "var(--radius-control)" }}
            >
              <Settings size={19} />
            </button>
          ))}
      </div>

      {/* Create wheel dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="glass-sheet max-w-sm">
          <DialogHeader>
            <DialogTitle className="type-section" style={{ color: "var(--ink-warm)" }}>Create wheel</DialogTitle>
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
              <p className="-mt-2 type-meta text-muted-foreground">
                Spins lean toward restaurants you haven't picked in a while.
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Rotate cuisines</Label>
              <Switch checked={rotateCuisines} onCheckedChange={setRotateCuisines} />
            </div>
            {rotateCuisines && (
              <p className="-mt-2 type-meta text-muted-foreground">
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
              className="relative overflow-hidden transition-colors duration-200 active:scale-[var(--press-scale)]"
              style={{
                minHeight: 56,
                borderRadius: "var(--radius-control)",
                background: "var(--brand-grad)",
                color: "var(--on-accent)",
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: "0.05em",
              }}
            >
              {createWheel.isPending ? (
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />Creating…</span>
              ) : "Create wheel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite link dialog */}
      <Dialog open={!!showInvite} onOpenChange={() => setShowInvite(null)}>
        <DialogContent className="glass-sheet max-w-sm">
          <DialogHeader>
            <DialogTitle className="type-section" style={{ color: "var(--ink-warm)" }}>Invite link</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-sm text-muted-foreground">Share this link with your team to join <strong className="text-foreground">{showInvite?.name}</strong>:</p>
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="bg-secondary/50 border-border/50 type-meta" />
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
        <DialogContent className="glass-sheet max-w-sm p-0 gap-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
            <DialogTitle className="type-section" style={{ color: "var(--ink-warm)" }}>Wheel settings</DialogTitle>
          </DialogHeader>
          {editWheel && (
            /* A BLOCK with space-y — deliberately not `flex flex-col gap-4`. As a
               flex column its children (flex-shrink defaults to 1, and index.css's
               unlayered `.flex{min-height:0}` removes the auto min-height floor)
               got squashed below their content height once the body overflowed, so
               the origin input, the locate button and the status lines rendered on
               top of each other. */
            <div className="space-y-4 px-5 pb-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
              {/* Members can open this dialog, so say why nothing responds
                  BEFORE they try. The footer note alone came too late — it sits
                  past everything they just failed to change. */}
              {!canEdit && (
                <div className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-secondary/30 px-3 py-2.5">
                  <Eye size={14} className="flex-shrink-0 mt-0.5 text-muted-foreground" />
                  <p className="type-meta text-muted-foreground">
                    <strong className="text-foreground">View only.</strong> Only the wheel's creator can change these
                    settings — ask them if something needs updating.
                  </p>
                </div>
              )}
              <SettingsSection>Basics</SettingsSection>
              <Input
                placeholder="Wheel name"
                value={editWheel.name}
                onChange={(e) => setEditWheel({ ...editWheel, name: e.target.value })}
                disabled={!canEdit}
                className="bg-secondary/50 border-border/50"
              />
              <SettingsSection>Sharing</SettingsSection>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Shared team wheel</Label>
                <Switch disabled={!canEdit} checked={editWheel.isShared} onCheckedChange={(v) => setEditWheel({ ...editWheel, isShared: v })} />
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
                      <p className="type-meta text-muted-foreground">Press Save settings to turn on sharing — you'll get an invite link right away.</p>
                    ) : token ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={inviteLinkFor(token)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-9 bg-background/60 border-border/50 type-meta font-mono"
                          />
                          <Button size="icon" variant="outline" className="h-11 w-11 flex-shrink-0" title="Copy invite link" onClick={() => copyLink(inviteLinkFor(token), "Invite link copied!")}>
                            <Copy size={14} />
                          </Button>
                          <Button size="icon" variant="outline" className="h-11 w-11 flex-shrink-0" title="Share invite" onClick={() => shareInviteLink(token, editWheel.name)}>
                            <Share2 size={14} />
                          </Button>
                        </div>
                        {/* Members may pass the existing link on — that's how a
                            team grows — but issuing a NEW token is owner-only on
                            the server, so don't offer a button that 403s. */}
                        {canEdit && (
                          <button type="button" onClick={regenerate} className="self-start type-meta text-muted-foreground hover:text-foreground underline underline-offset-2">
                            Regenerate link (invalidates the old one)
                          </button>
                        )}
                        <p className="type-meta text-muted-foreground">Anyone with this link can sign in and join the team.</p>
                      </>
                    ) : canEdit ? (
                      <>
                        <Button type="button" variant="outline" size="sm" className="self-start gap-2" onClick={regenerate}>
                          <Share2 size={14} /> Generate invite link
                        </Button>
                        <p className="type-meta text-muted-foreground">Anyone with this link can sign in and join the team.</p>
                      </>
                    ) : (
                      <p className="type-meta text-muted-foreground">No invite link yet — ask the wheel's creator to generate one.</p>
                    )}
                  </div>
                );
              })()}
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Public (anyone with link can view &amp; spin)</Label>
                <Switch disabled={!canEdit} checked={editWheel.isPublic} onCheckedChange={(v) => setEditWheel({ ...editWheel, isPublic: v })} />
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
                        className="h-9 bg-background/60 border-border/50 type-meta font-mono"
                      />
                      <Button size="icon" variant="outline" className="h-11 w-11 flex-shrink-0" title="Copy link" onClick={() => copyPublicLink(editWheel.id)}>
                        <Copy size={14} />
                      </Button>
                      <Button size="icon" variant="outline" className="h-11 w-11 flex-shrink-0" title="Share" onClick={() => sharePublicLink(editWheel.id, editWheel.name)}>
                        <Share2 size={14} />
                      </Button>
                    </div>
                    <p className={`type-meta flex items-center gap-1.5 ${live ? "" : "text-muted-foreground"}`} style={live ? { color: "var(--ok)" } : undefined}>
                      <Globe size={12} className="flex-shrink-0" />
                      {live ? "Live — anyone with this link can view & spin." : "Turns live when you press Save settings."}
                    </p>
                  </div>
                );
              })()}
              <SettingsSection>Spin rules</SettingsSection>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Skip recently-spun for</Label>
                <Select disabled={!canEdit} value={String(editWheel.exclusionDays)} onValueChange={(v) => setEditWheel({ ...editWheel, exclusionDays: parseInt(v) })}>
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
                <Switch disabled={!canEdit} checked={editWheel.fairnessMode} onCheckedChange={(v) => setEditWheel({ ...editWheel, fairnessMode: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Rotate cuisines</Label>
                <Switch disabled={!canEdit} checked={editWheel.rotateCuisines} onCheckedChange={(v) => setEditWheel({ ...editWheel, rotateCuisines: v })} />
              </div>

              <SettingsSection>Distance</SettingsSection>
              {/* Distance mode — its origin (paste a link / geolocate) is resolved
                  into local state here and only actually persisted by the single
                  save button below, together with everything else in this dialog. */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Distance mode</Label>
                  <Switch
                    disabled={!canEdit}
                    checked={editWheel.distanceEnabled}
                    onCheckedChange={(v) => setEditWheel({ ...editWheel, distanceEnabled: v })}
                  />
                </div>
                {editWheel.distanceEnabled && (
                  <>
                    <p className="-mt-1 type-meta text-muted-foreground">
                      Shows walking time from one point to every restaurant.
                      {editWheel.isShared ? " Shared wheels use a single office/meeting point, visible to the team." : ""}
                    </p>
                    {editingOrigin && canEdit && (
                      <>
                        <Input
                          placeholder="Label (e.g. Office)"
                          value={editWheel.originLabel}
                          onChange={(e) => setEditWheel({ ...editWheel, originLabel: e.target.value })}
                          className="bg-secondary/50 border-border/50"
                        />
                        {/* Same three ways in as everywhere else: current
                            location, search a place, or paste a link. */}
                        <LocationPicker
                          compact
                          primaryLabel="Use my current location"
                          onPicked={(at) =>
                            setEditWheel({
                              ...editWheel,
                              originLat: at.lat,
                              originLng: at.lng,
                              // A named pick renames the office to that place;
                              // a raw fix keeps whatever label is already there.
                              originLabel: at.label ?? editWheel.originLabel,
                            })
                          }
                        />
                      </>
                    )}
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
                          <p className="type-meta flex items-center gap-1.5 text-muted-foreground">
                            <MapPin size={12} className="flex-shrink-0" />
                            No location set yet — pick one above
                          </p>
                        );
                      }
                      const isPersisted = editWheel.originLat === savedLat && editWheel.originLng === savedLng;
                      const mapHref = `https://www.google.com/maps/search/?api=1&query=${editWheel.originLat},${editWheel.originLng}`;
                      // A wheel that HAS an office shows it, rather than a pair
                      // of blank inputs that read as "nothing is set".
                      return (
                        <div
                          className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-secondary/30 px-3 py-2.5"
                        >
                          <MapPin size={14} className="flex-shrink-0" style={{ color: "var(--ok)" }} />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm truncate">{editWheel.originLabel.trim() || "Office"}</span>
                            <span className="type-meta flex items-center gap-1.5" style={{ color: isPersisted ? "var(--muted-foreground)" : "var(--brand-text)" }}>
                              {isPersisted ? "Saved" : "Press Save settings to apply"}
                              <a href={mapHref} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                                view on map
                              </a>
                            </span>
                          </div>
                          {canEdit && !editingOrigin && (
                            <button
                              type="button"
                              onClick={() => setEditingOrigin(true)}
                              className="flex-shrink-0 type-meta font-semibold px-2.5 py-1 rounded-full hover:bg-white/10 transition-colors"
                              style={{ color: "var(--foreground)" }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Danger zone — owner only, and last, so it can't be reached by
                  accident on the way to anything else. */}
              {canEdit && (
                <>
                  <SettingsSection>Danger zone</SettingsSection>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm">Delete this wheel</span>
                      <span className="type-meta text-muted-foreground">Permanent — restaurants and history go with it.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete({ id: editWheel.id, name: editWheel.name })}
                      className="flex-shrink-0 flex items-center gap-1.5 type-meta font-semibold px-3 py-1.5 rounded-full transition-colors hover:bg-destructive/15"
                      style={{ color: "var(--destructive)", border: "1px solid oklch(from var(--destructive) l c h / 0.4)" }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </>
              )}

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
              {canEdit ? (
                <Button
                  onClick={saveWheelSettings}
                  disabled={!editWheel.name.trim() || savingWheelSettings}
                  className="w-full transition-colors duration-200 active:scale-[var(--press-scale)]"
                  style={{
                    minHeight: 56,
                    borderRadius: "var(--radius-control)",
                    background: "var(--brand-grad)",
                    color: "var(--on-accent)",
                    fontSize: 16,
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                  }}
                >
                  {savingWheelSettings ? (
                    <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />Saving…</span>
                  ) : "Save settings"}
                </Button>
              ) : (
                /* Members see the settings but can't change them — no Save at
                   all, rather than a button that would only fail server-side. */
                <p className="type-meta text-muted-foreground text-center py-1">
                  Only the wheel's creator can change these settings.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — one dialog for both entry points (the row kebab
          and the settings danger zone), rendered here at the root so neither of
          those can unmount it mid-decision. */}
      <ConfirmDangerDialog
        open={!!confirmLeave}
        onOpenChange={(open) => { if (!open && !leaveWheel.isPending) setConfirmLeave(null); }}
        title="LEAVE WHEEL"
        confirmLabel="Leave wheel"
        pending={leaveWheel.isPending}
        onConfirm={() => confirmLeave && leaveWheel.mutate({ id: confirmLeave.id })}
        body={
          <>
            <p>
              Leave <strong className="text-foreground">{confirmLeave?.name}</strong>? It stays with the rest of the
              team — you just stop seeing it.
            </p>
            <p>
              Your ratings stay on the places you rated, so rejoining with the invite link brings everything back.
            </p>
          </>
        }
      />

      <ConfirmDangerDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open && !deleteWheel.isPending) setConfirmDelete(null); }}
        title="DELETE WHEEL"
        confirmLabel="Delete wheel"
        pending={deleteWheel.isPending}
        onConfirm={() => confirmDelete && deleteWheel.mutate({ id: confirmDelete.id })}
        body={
          <>
            <p>
              Delete <strong className="text-foreground">{confirmDelete?.name}</strong> and everything on it — its
              restaurants, spin history and, on a shared wheel, the team's access.
            </p>
            <p style={{ color: "var(--destructive)" }}>This cannot be undone.</p>
          </>
        }
      />
    </>
  );
}
