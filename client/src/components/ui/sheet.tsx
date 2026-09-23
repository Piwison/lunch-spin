"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLang } from "@/i18n";

type SheetSide = "top" | "right" | "bottom" | "left";

/** Which edge the open sheet came from, for SheetHeader (see there). */
const SheetSideContext = React.createContext<SheetSide>("right");

/** The close control: a 44px target with a 20px glyph, in the body-warm ink. */
function SheetCloseButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { t } = useLang();
  return (
    <SheetPrimitive.Close
      className={cn(
        "flex flex-shrink-0 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none",
        className
      )}
      style={{
        width: 44,
        height: 44,
        borderRadius: "var(--radius-control)",
        color: "var(--body-warm)",
        ...style,
      }}
    >
      <XIcon className="size-5" />
      <span className="sr-only">{t("common.close")}</span>
    </SheetPrimitive.Close>
  );
}

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[var(--scrim)]",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          // No `bg-background` and no `border-*`. Both were shadcn defaults and
          // both fought the app: `bg-background` is a UTILITY, so it outranks
          // the `.glass-sheet` recipe in @layer components that call sites pass
          // in — the filter sheet was opaque paper with a hairline while every
          // other sheet in the app was glass. Surfaces come from the class the
          // caller passes; this only positions and animates.
          "glass-sheet",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto",
          // The bottom sheet is the app's one modal shape on a phone, and it
          // matches the winner: square where it meets the screen edge, rounded
          // where it meets the page, and a grab handle so it reads as something
          // you can pull rather than a panel that appeared.
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto rounded-b-none pt-3",
          className
        )}
        {...props}
      >
        {side === "bottom" && (
          <div aria-hidden="true" className="flex justify-center -mb-2 flex-shrink-0">
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "var(--border)",
                opacity: 0.9,
              }}
            />
          </div>
        )}
        <SheetSideContext.Provider value={side}>{children}</SheetSideContext.Provider>
        {/* A bottom sheet's close sits IN its header row (SheetHeader). Pinned
            absolutely at top-4/right-4 it was 14px above a header whose row is
            56px tall — the wheel switcher's "+ New" — so title, action and X
            read as three things at three heights. */}
        {side !== "bottom" && <SheetCloseButton className="absolute top-4 right-4" />}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

/**
 * On a bottom sheet the header is ONE row — title, the caller's actions, then
 * the close — all centred on the same line. Actions that belong at the right
 * take `ml-auto` inside the row; the close always ends it. The caller owns the
 * horizontal padding, and should set it so the title starts where the sheet's
 * own content starts (the row icons, the chip groups), not at the sheet's rim.
 */
function SheetHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  const side = React.useContext(SheetSideContext);
  if (side === "bottom") {
    return (
      <div
        data-slot="sheet-header"
        className={cn("flex flex-row items-center gap-2 pt-3 pb-1", className)}
        {...props}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{children}</div>
        <SheetCloseButton />
      </div>
    );
  }
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
