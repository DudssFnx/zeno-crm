"use client"

import { GripVertical } from "lucide-react"
import * as React from "react"
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels"

import { cn } from "@/lib/utils"

/* ---------------- PANEL GROUP ---------------- */

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof PanelGroup>) => (
  <PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

/* ---------------- PANEL ---------------- */

const ResizablePanel = Panel

/* ---------------- HANDLE ---------------- */

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  <PanelResizeHandle
    className={cn(
      "relative flex w-px items-center justify-center bg-border",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "data-[panel-group-direction=vertical]:h-px",
      "data-[panel-group-direction=vertical]:w-full",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </PanelResizeHandle>
)

export {
  ResizableHandle, ResizablePanel, ResizablePanelGroup
}

