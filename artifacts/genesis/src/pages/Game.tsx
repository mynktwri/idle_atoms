import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useGameLoop } from "../hooks/useGameLoop";
import { useGameState } from "../hooks/useGameState";
import { ReactionWindow } from "../components/ReactionWindow";
import { ResourceBar } from "../components/ResourceBar";
import { CollideButton } from "../components/CollideButton";
import { BuildingPanel } from "../components/BuildingPanel";
import { UpgradePanel } from "../components/UpgradePanel";
import { PrestigePanel } from "../components/PrestigePanel";
import { Trash2 } from "lucide-react";

export default function Game() {
  useGameLoop();
  const state = useGameState();

  return (
    <div className="h-[100dvh] w-full bg-background text-foreground font-sans flex flex-col overflow-y-auto">

      {/* ── Sticky simulation window ───────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background flex justify-center pt-5 pb-4
                      border-b border-border/40 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        {/* Wrapper so we can position the reset button relative to the canvas */}
        <div className="relative">
          <ReactionWindow />
          <button
            onClick={() => {
              if (confirm("Wipe save? This cannot be undone.")) state.resetSave();
            }}
            className="absolute bottom-3 right-3 p-1.5 rounded-full bg-black/50
                       text-muted-foreground hover:text-destructive hover:bg-black/70
                       transition-colors backdrop-blur-sm z-10"
            title="Reset Save"
            data-testid="button-reset-save"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Scrollable controls ────────────────────────────────────────────── */}
      <div className="w-full flex flex-col items-center">
        <div className="w-full max-w-[560px]">

          <ResourceBar />
          <CollideButton />

          <TabsPrimitive.Root defaultValue="buildings" className="flex flex-col">
            <TabsPrimitive.List className="flex border-b border-border/50 px-4">
              <TabsPrimitive.Trigger
                value="buildings"
                className="flex-1 py-3 text-sm font-mono uppercase tracking-widest
                           text-muted-foreground data-[state=active]:text-primary
                           data-[state=active]:border-b-2 data-[state=active]:border-primary
                           transition-colors"
              >
                Buildings
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger
                value="upgrades"
                className="flex-1 py-3 text-sm font-mono uppercase tracking-widest
                           text-muted-foreground data-[state=active]:text-accent
                           data-[state=active]:border-b-2 data-[state=active]:border-accent
                           transition-colors"
              >
                Upgrades
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger
                value="prestige"
                className="flex-1 py-3 text-sm font-mono uppercase tracking-widest
                           text-muted-foreground data-[state=active]:text-destructive
                           data-[state=active]:border-b-2 data-[state=active]:border-destructive
                           transition-colors relative"
              >
                Prestige
                {state.tier >= 5 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent animate-pulse" />
                )}
              </TabsPrimitive.Trigger>
            </TabsPrimitive.List>

            {/* Tab contents — full natural height, no clipping */}
            <TabsPrimitive.Content value="buildings" className="outline-none">
              <BuildingPanel />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="upgrades" className="outline-none">
              <UpgradePanel />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="prestige" className="outline-none">
              <PrestigePanel />
            </TabsPrimitive.Content>
          </TabsPrimitive.Root>

          {/* Bottom breathing room */}
          <div className="h-12" />
        </div>
      </div>

    </div>
  );
}
