import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Plus, Globe, Lock, ChevronRight, Trash2, Share2, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

interface WheelSelectorProps {
  selectedWheelId: number | null;
  onSelect: (id: number) => void;
}

export default function WheelSelector({ selectedWheelId, onSelect }: WheelSelectorProps) {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [showInvite, setShowInvite] = useState<{ wheelId: number; token: string; name: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: wheels } = trpc.wheels.list.useQuery();
  const createWheel = trpc.wheels.create.useMutation({
    onSuccess: (data) => {
      utils.wheels.list.invalidate();
      setShowCreate(false);
      setNewName("");
      onSelect(data.id);
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
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && createWheel.mutate({ name: newName.trim(), isShared, isPublic })}
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
            <Button
              onClick={() => newName.trim() && createWheel.mutate({ name: newName.trim(), isShared, isPublic })}
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
    </>
  );
}
