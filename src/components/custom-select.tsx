"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

const emptyValue = "__custom-select-empty__";

export type CustomSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type CustomSelectProps = {
  label: string;
  value: string;
  options: CustomSelectOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function CustomSelect({ label, value, options, onValueChange, disabled = false, className }: CustomSelectProps) {
  return (
    <SelectPrimitive.Root
      value={value || emptyValue}
      onValueChange={(nextValue) => onValueChange(nextValue === emptyValue ? "" : nextValue)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        type="button"
        aria-label={label}
        className={`group inline-flex h-11 min-w-0 max-w-full items-center justify-between gap-3 rounded-xl border-2 border-ink/10 bg-white px-3 text-left text-sm font-bold text-ink shadow-[0_2px_0_rgba(36,33,54,.08)] outline-none transition hover:border-violet/40 focus-visible:border-violet data-[state=open]:border-violet data-[state=open]:shadow-[0_3px_0_#d9d3f5] disabled:pointer-events-none disabled:opacity-50 ${className ?? ""}`}
      >
        <SelectPrimitive.Value className="min-w-0 flex-1 truncate" />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180" size={17} strokeWidth={2.5} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="z-[100] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border-2 border-ink bg-white shadow-[0_7px_0_rgba(36,33,54,.18)]"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-8 cursor-default items-center justify-center bg-white text-muted">
            <ChevronUp size={16} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="max-h-72 p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={`${option.value}:${option.label}`}
                value={option.value || emptyValue}
                disabled={option.disabled}
                className="relative flex min-h-11 cursor-default select-none items-center rounded-lg py-2 pl-3 pr-9 text-sm font-bold leading-5 text-ink outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-violet data-[highlighted]:text-white data-[state=checked]:bg-[#f0edff] data-[state=checked]:text-violet data-[highlighted]:data-[state=checked]:bg-violet data-[highlighted]:data-[state=checked]:text-white"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center">
                  <Check size={16} strokeWidth={3} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-8 cursor-default items-center justify-center bg-white text-muted">
            <ChevronDown size={16} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
