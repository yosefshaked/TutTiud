"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const DOCUMENT_DIRECTION_ATTRIBUTE = "dir"

const getDocumentDirection = () => {
  if (typeof document === "undefined") {
    return "ltr"
  }
  const root = document.documentElement
  const declaredDirection = root?.getAttribute(DOCUMENT_DIRECTION_ATTRIBUTE)
  return declaredDirection === "rtl" ? "rtl" : "ltr"
}

const Switch = React.forwardRef(({ className, ...props }, ref) => {
  const [direction, setDirection] = React.useState(getDocumentDirection)

  React.useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
      return
    }

    const root = document.documentElement
    if (!root) return

    const observer = new MutationObserver(() => {
      setDirection(getDocumentDirection())
    })

    observer.observe(root, { attributes: true, attributeFilter: [DOCUMENT_DIRECTION_ATTRIBUTE] })

    return () => observer.disconnect()
  }, [])

  const isRtl = direction === "rtl"

  const thumbAnchorClass = isRtl ? "right-0" : "left-0"
  const thumbCheckedTranslate = isRtl
    ? "data-[state=checked]:-translate-x-[1.25rem]"
    : "data-[state=checked]:translate-x-[1.25rem]"

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
      ref={ref}>
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-out",
          thumbAnchorClass,
          "data-[state=unchecked]:translate-x-0",
          thumbCheckedTranslate
        )}
      />
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
